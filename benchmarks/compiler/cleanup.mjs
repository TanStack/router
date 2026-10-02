import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compilerFingerprint } from './provenance.mjs'

// Run the same harness against rebuilt checkouts in alternating fresh processes.
// Analyze/clone/edit outside the timer to isolate cleanup, including its first use.
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}
const workspace = path.resolve(
  option('--workspace', fileURLToPath(new URL('../../', import.meta.url))),
)
const selected = option('--case', 'route')
const warm = args.includes('--warm')
const outputs = Number(option('--outputs', '5'))
const samples = Number(option('--samples', '60'))
const batch = Number(option('--batch', '20'))
for (const value of [outputs, samples, batch]) {
  assert.ok(Number.isSafeInteger(value) && value > 0)
}
assert.ok(['route', 'nested', 'wide', 'empty'].includes(selected))
const utils = await import(
  pathToFileURL(path.join(workspace, 'packages/router-utils/dist/esm/index.js'))
)
const require = createRequire(
  path.join(workspace, 'packages/router-utils/package.json'),
)
const { is, walk } = await import(pathToFileURL(require.resolve('yuku-ast')))
const body = `
  const { state, label } = initialize();
  const load = () => server(state);
  const render = () => client(label);
  const unused = sideEffect();
  return createRoute({ loader: load, component: render });`
const code =
  selected === 'empty'
    ? 'sideEffect()'
    : `
import { server } from './server';
import { client } from './client';
${
  selected === 'nested'
    ? Array.from(
        { length: 40 },
        (_, i) => `export function factory${i}() { ${body} }`,
      ).join('\n')
    : `export function factory() { ${body} }`
}`
const source =
  selected === 'wide'
    ? `import { server } from './server'; import { client } from './client'; ${Array.from({ length: 200 }, (_, i) => `export function factory${i}() { ${body} }`).join('\n')}`
    : code
const filename = 'cleanup.tsx'
// The baseline predates reusable cleanup; use its public one-output API.
const createCleanup =
  utils.createBindingCleanup ??
  ((module) => (program, originalNodes, options) =>
    utils.removeUnusedBindings(module, program, originalNodes, options))
function prepare() {
  const module = utils.analyzeModule({ code: source, filename })
  const clean = createCleanup(module)
  if (warm) {
    const { program, originalNodes } = utils.cloneModuleAst(module)
    clean(program, originalNodes)
  }
  const copies = Array.from({ length: outputs }, (_, index) => {
    const copy = utils.cloneModuleAst(module)
    walk(copy.program, {
      Property(node, context) {
        if (is.Identifier(node.key, index % 2 ? 'component' : 'loader')) {
          context.remove()
        }
      },
    })
    return copy
  })
  return { module, copies, clean }
}
function cleanup({ copies, clean }) {
  for (let i = 0; i < copies.length; i++) {
    const { program, originalNodes } = copies[i]
    clean(program, originalNodes, {
      preserveInitiallyUnused: i % 2 === 0,
    })
  }
}
if (args.includes('--retention')) {
  assert.equal(typeof globalThis.gc, 'function', 'Run with --expose-gc')
  globalThis.gc()
  const before = process.memoryUsage()
  let modules = Array.from({ length: 128 }, () =>
    utils.analyzeModule({ code: source, filename }),
  )
  globalThis.gc()
  const analyzed = process.memoryUsage()
  const cleanups = modules.map(createCleanup)
  function populate(module, index) {
    const { program, originalNodes } = utils.cloneModuleAst(module)
    cleanups[index](program, originalNodes)
  }
  modules.forEach(populate)
  globalThis.gc()
  const populated = process.memoryUsage()
  const weakModules = modules.map((module) => new WeakRef(module))
  cleanups.length = 0
  modules = null
  await new Promise((resolve) => setImmediate(resolve))
  globalThis.gc()
  const released = process.memoryUsage()
  const remainingModules = weakModules.filter((ref) => ref.deref()).length
  console.log(
    JSON.stringify(
      {
        diagnosticOnly: true,
        node: process.version,
        sourceSha256: createHash('sha256').update(source).digest('hex'),
        modules: 128,
        case: selected,
        compiler: compilerFingerprint(workspace),
        before,
        analyzed,
        populated,
        released,
        remainingModules,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}
assert.equal(typeof globalThis.gc, 'function', 'Run with --expose-gc')
const checked = prepare()
const original = utils.generateModule(checked.module.ast, {
  source,
  filename,
})
cleanup(checked)
const hash = createHash('sha256')
for (let i = 0; i < outputs; i++) {
  const result = utils.generateModule(checked.copies[i].program, {
    source,
    filename,
  })
  if (selected !== 'empty') {
    assert.ok(!result.code.includes(i % 2 ? './client' : './server'))
    assert.ok(result.code.includes(i % 2 ? './server' : './client'))
    assert.equal(result.code.includes('const unused'), i % 2 === 0)
    assert.ok(result.code.includes('state, label'))
  }
  hash.update(JSON.stringify(result))
}
assert.deepEqual(
  utils.generateModule(checked.module.ast, { source, filename }),
  original,
)
for (let i = 0; i < 10; i++) {
  cleanup(prepare())
}
globalThis.gc?.()
const before = process.memoryUsage()
const milliseconds = []
for (let sample = 0; sample < samples; sample++) {
  const jobs = Array.from({ length: batch }, prepare)
  const start = performance.now()
  for (const job of jobs) {
    cleanup(job)
  }
  milliseconds.push((performance.now() - start) / batch)
}
globalThis.gc?.()
const after = process.memoryUsage()
const sorted = [...milliseconds].sort((a, b) => a - b)
const mean = milliseconds.reduce((sum, value) => sum + value, 0) / samples
const sd = Math.sqrt(
  milliseconds.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, samples - 1),
)
console.log(
  JSON.stringify(
    {
      case: selected,
      outputs,
      warm,
      samples,
      batch,
      node: process.version,
      compiler: compilerFingerprint(workspace),
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      outputSha256: hash.digest('hex'),
      medianMs: sorted[Math.floor(samples / 2)],
      meanMs: mean,
      standardDeviationMs: sd,
      cvPercent: (sd / mean) * 100,
      p99BatchAverageMs:
        sorted[Math.min(samples - 1, Math.floor(samples * 0.99))],
      peakRssKiB: process.resourceUsage().maxRSS,
      retainedHeapDelta: after.heapUsed - before.heapUsed,
      milliseconds,
    },
    null,
    2,
  ),
)
