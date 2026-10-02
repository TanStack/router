import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compilerFingerprint } from './provenance.mjs'

const args = process.argv.slice(2)
const option = (key, fallback) => {
  const index = args.indexOf(key)
  return index < 0 ? fallback : args[index + 1]
}
const workspace = path.resolve(
  option('--workspace', fileURLToPath(new URL('../../', import.meta.url))),
)
const boundaries = Number(option('--boundaries', '10'))
const iterations = Number(option('--iterations', '20'))
assert.ok(Number.isSafeInteger(boundaries) && boundaries > 0)
assert.ok(Number.isSafeInteger(iterations) && iterations > 0)
assert.equal(typeof globalThis.gc, 'function', 'Run with --expose-gc')
const entry = (file) =>
  pathToFileURL(
    path.join(workspace, 'packages/start-plugin-core/dist/esm', file),
  )
const { createStartCompiler } = await import(entry('start-compiler/host.js'))
const { createHydrateCompilerPlugin } = await import(
  entry('hydrate-when-transform.js')
)
const root = '/compiler-benchmark'
const sourceId = `${root}/route.tsx`
const code = `import { Hydrate } from '@tanstack/react-start';
${Array.from({ length: boundaries }, (_, i) => `import { Widget${i} } from './widget-${i}';`).join('\n')}
export function Page() { return <main>${Array.from({ length: boundaries }, (_, i) => `<Hydrate when={true}><Widget${i} /></Hydrate>`).join('')}</main> }`
function host(plugin) {
  return createStartCompiler({
    env: 'client',
    envName: 'client',
    root,
    framework: 'react',
    providerEnvName: 'ssr',
    mode: 'build',
    compilerPlugins: [plugin],
    getKnownServerFns: () => ({}),
    resolveId: async () => null,
    loadModule: async (id) => {
      throw new Error(`Unexpected load: ${id}`)
    },
  })
}
async function populate(plugin, id, check = false) {
  const output = await host(plugin).compile({ id, code })
  assert.ok(output)
  const ids = [
    ...output.code.matchAll(/import\("([^\"]*[?&]tss-hydrate=[^\"]*)"\)/g),
  ].map((match) => match[1])
  assert.equal(new Set(ids).size, boundaries)
  const digest = check
    ? createHash('sha256').update(JSON.stringify(output))
    : null
  // Every child is loaded once; this must not benchmark the virtual-output cache.
  for (let index = ids.length - 1; index >= 0; index--) {
    const child = plugin.loadVirtualModule({
      id: ids[index],
      root,
      env: 'client',
      envName: 'client',
    })
    assert.ok(child)
    if (check) {
      assert.ok(child.code.includes(`./widget-${index}`))
      assert.equal((child.code.match(/\.\/widget-/g) ?? []).length, 1)
      digest.update(JSON.stringify(child))
    }
  }
  return digest?.digest('hex')
}
const outputHash = await populate(createHydrateCompilerPlugin(), sourceId, true)
for (let index = 0; index < 3; index++) {
  await populate(createHydrateCompilerPlugin(), sourceId)
}
globalThis.gc()
const times = []
for (let index = 0; index < iterations; index++) {
  const start = performance.now()
  await populate(createHydrateCompilerPlugin(), sourceId)
  times.push(performance.now() - start)
}
globalThis.gc()
const before = process.memoryUsage()
const plugin = createHydrateCompilerPlugin()
const ids = Array.from({ length: 64 }, (_, i) => `${root}/route-${i}.tsx`)
for (const id of ids) {
  await populate(plugin, id)
}
globalThis.gc()
const populated = process.memoryUsage()
for (const id of ids) {
  plugin.invalidateModule({ id, envName: 'client' })
}
await new Promise((resolve) => setImmediate(resolve))
globalThis.gc()
const invalidated = process.memoryUsage()
const mean = times.reduce((sum, value) => sum + value, 0) / times.length
const sd = Math.sqrt(
  times.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, times.length - 1),
)
console.log(
  JSON.stringify(
    {
      boundaries,
      iterations,
      node: process.version,
      compiler: compilerFingerprint(workspace),
      sourceHash: createHash('sha256').update(code).digest('hex'),
      outputHash,
      meanMs: mean,
      standardDeviationMs: sd,
      medianMs: [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)],
      times,
      retainedSources: ids.length,
      before,
      populated,
      invalidated,
    },
    null,
    2,
  ),
)
