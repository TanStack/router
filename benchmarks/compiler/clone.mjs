import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compilerFingerprint } from './provenance.mjs'

// Run in a fresh process after building the selected workspace through Nx.
// Analysis and correctness checks are outside the timed repeated-copy workload.
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}
const workspace = path.resolve(
  option('--workspace', fileURLToPath(new URL('../../', import.meta.url))),
)
const selected = option('--case', 'route')
const samples = Number(option('--samples', '100'))
const batch = Number(option('--batch', '20'))
assert.ok(Number.isSafeInteger(samples) && samples > 0)
assert.ok(Number.isSafeInteger(batch) && batch > 0)
const utils = await import(
  pathToFileURL(path.join(workspace, 'packages/router-utils/dist/esm/index.js'))
)
const require = createRequire(
  path.join(workspace, 'packages/router-utils/package.json'),
)
const { b, walk } = await import(pathToFileURL(require.resolve('yuku-ast')))
const sources = {
  route: `import { createFileRoute } from '@tanstack/react-router';
    const state = { count: 0 }; const read = () => ++state.count;
    export const Route = createFileRoute('/')({ loader: read,
      component: () => <button onClick={read}>{state.count}</button> });`,
  wide: Array.from(
    { length: 1000 },
    (_, i) => `export const value${i} = { index: ${i}, values: [1, 2, 3] };`,
  ).join('\n'),
  literals: Array.from(
    { length: 200 },
    (_, i) =>
      `/* comment ${i} */ export const value${i} = [/ab+/gi, 123n, null, 'é😀', , true];`,
  ).join('\n'),
  deep: `export const value = ${'!'.repeat(200)}external;`,
}
let operation
const digest = createHash('sha256')
if (selected in sources) {
  const source = sources[selected]
  const module = utils.analyzeModule({ code: source, filename: 'clone.tsx' })
  const output = utils.cloneModuleAst(module)
  assert.deepEqual(output.program, module.ast)
  const originals = []
  walk(module.ast, {
    enter(node) {
      originals.push(node)
    },
  })
  let index = 0
  walk(output.program, {
    enter(node) {
      const original = originals[index++]
      assert.notEqual(node, original)
      assert.equal(output.originalNodes.get(node), original)
      if (output.copiedNodes) {
        assert.equal(output.copiedNodes.get(original), node)
      }
    },
  })
  const options = { source, filename: 'clone.tsx' }
  assert.deepEqual(
    utils.generateModule(output.program, options),
    utils.generateModule(module.ast, options),
  )
  digest.update(JSON.stringify(utils.generateModule(output.program, options)))
  operation = () => utils.cloneModuleAst(module).program.body.length
} else {
  const reference = utils.linkGeneratedReference(
    b.Identifier({ name: 'loadCss' }),
    'loadCss',
  )
  const fragments = {
    identifier: reference,
    generated: utils.parseExpression(
      'Promise.all([loadCss("/a.css"), loadCss("/b.css")]).then(() => render(value))',
    ),
    shared: b.BinaryExpression({
      operator: '+',
      left: reference,
      right: reference,
    }),
  }
  assert.ok(selected in fragments, `Unknown case: ${selected}`)
  const fragment = fragments[selected]
  const output = utils.cloneGeneratedNode(fragment)
  assert.deepEqual(output, fragment)
  assert.notEqual(output, fragment)
  if (selected === 'shared') {
    assert.equal(output.left, output.right)
  }
  digest.update(JSON.stringify(output))
  operation = () => utils.cloneGeneratedNode(fragment).start
}
let consumed = 0
for (let i = 0; i < batch * 10; i++) {
  consumed += operation()
}
globalThis.gc?.()
const before = process.memoryUsage()
const milliseconds = []
for (let i = 0; i < samples; i++) {
  const start = performance.now()
  for (let j = 0; j < batch; j++) {
    consumed += operation()
  }
  milliseconds.push((performance.now() - start) / batch)
}
globalThis.gc?.()
const after = process.memoryUsage()
const sorted = [...milliseconds].sort((a, b) => a - b)
const mean = milliseconds.reduce((sum, value) => sum + value, 0) / samples
const standardDeviation = Math.sqrt(
  milliseconds.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, samples - 1),
)
console.log(
  JSON.stringify(
    {
      case: selected,
      node: process.version,
      workspace,
      compiler: compilerFingerprint(workspace),
      samples,
      batch,
      meanMs: mean,
      standardDeviationMs: standardDeviation,
      medianMs: sorted[Math.floor(samples / 2)],
      p99Ms: sorted[Math.min(samples - 1, Math.floor(samples * 0.99))],
      peakRssKiB: process.resourceUsage().maxRSS,
      retainedHeapDelta: after.heapUsed - before.heapUsed,
      outputSha256: digest.digest('hex'),
      consumed,
      milliseconds,
    },
    null,
    2,
  ),
)
