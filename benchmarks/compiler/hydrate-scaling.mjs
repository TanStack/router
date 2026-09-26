import { compilerFingerprint } from './provenance.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}
const workspace = path.resolve(
  option('--workspace', fileURLToPath(new URL('../../', import.meta.url))),
)
const repetitions = Number(option('--repetitions', '5'))
const iterations = Number(option('--iterations', '5'))
const sizes = option('--sizes', '10,100,500').split(',').map(Number)
const env = option('--env', 'client')
assert.ok(env === 'client' || env === 'server')
for (const number of [repetitions, iterations, ...sizes]) {
  assert.ok(Number.isSafeInteger(number) && number > 0)
}
if (!args.includes('--worker')) {
  const samples = []
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const size of sizes) {
      const result = spawnSync(
        process.execPath,
        [
          '--expose-gc',
          fileURLToPath(import.meta.url),
          '--worker',
          '--workspace',
          workspace,
          '--sizes',
          String(size),
          '--iterations',
          String(iterations),
          '--env',
          env,
        ],
        {
          encoding: 'utf8',
          maxBuffer: 4 * 1024 * 1024,
          env: { ...process.env, NODE_ENV: 'production' },
        },
      )
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      samples.push({ repetition, ...JSON.parse(result.stdout) })
    }
  }
  const median = (array) =>
    array.sort((a, b) => a - b)[Math.floor(array.length / 2)]
  const summary = sizes.map((size) => {
    const subset = samples.filter((sample) => sample.boundaries === size)
    assert.ok(
      subset.every((sample) => sample.sourceHash === subset[0].sourceHash),
    )
    return {
      boundaries: size,
      medianCompileMs: median(subset.map((sample) => sample.msPerCompile)),
      medianPeakRssMiB: median(subset.map((sample) => sample.peakRssMiB)),
    }
  })
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        compilerFingerprint: compilerFingerprint(workspace),
        workspace,
        node: process.version,
        env,
        repetitions,
        iterations,
        summary,
        samples,
      },
      null,
      2,
    ),
  )
} else {
  const boundaries = sizes[0]
  const entry = (relative) =>
    pathToFileURL(
      path.join(workspace, 'packages/start-plugin-core/dist/esm', relative),
    ).href
  const { createStartCompiler } = await import(entry('start-compiler/host.js'))
  const { createHydrateCompilerPlugin } = await import(
    entry('hydrate-when-transform.js')
  )
  const code = `import { Hydrate } from '@tanstack/react-start';
import { visible } from '@tanstack/react-start/hydration';
${Array.from({ length: boundaries }, (_, index) => `const props${index} = { when: visible(), fallback: <span>Loading ${index}</span> };`).join('\n')}
function Widget({ value }: { value: number }) { return <button>{value}</button> }
export function Page() { return <main>${Array.from({ length: boundaries }, (_, index) => `<Hydrate {...props${index}}><Widget value={${index}} /></Hydrate>`).join('\n')}</main> }
`
  let outputBytes = 0
  async function compile() {
    const plugin = createHydrateCompilerPlugin()
    const compiler = createStartCompiler({
      env,
      envName: env === 'client' ? 'client' : 'ssr',
      root: '/compiler-benchmark',
      framework: 'react',
      providerEnvName: 'ssr',
      mode: 'build',
      compilerPlugins: [plugin],
      getKnownServerFns: () => ({}),
      resolveId: async () => null,
      loadModule: async (id) => {
        throw new Error(`Unexpected module load: ${id}`)
      },
    })
    const result = await compiler.compile({
      id: '/compiler-benchmark/route.tsx',
      code,
    })
    assert.ok(result)
    if (env === 'client') {
      assert.equal(result.code.match(/tss-hydrate=/g)?.length, boundaries)
    } else {
      assert.ok(!result.code.includes('Loading '))
    }
    outputBytes +=
      Buffer.byteLength(result.code) +
      Buffer.byteLength(JSON.stringify(result.map))
  }
  await compile()
  global.gc()
  const before = process.memoryUsage()
  const start = performance.now()
  for (let index = 0; index < iterations; index++) {
    await compile()
  }
  const elapsedMs = performance.now() - start
  global.gc()
  console.log(
    JSON.stringify({
      boundaries,
      sourceBytes: Buffer.byteLength(code),
      sourceHash: createHash('sha256').update(code).digest('hex'),
      msPerCompile: elapsedMs / iterations,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
      before,
      retained: process.memoryUsage(),
      outputBytes,
    }),
  )
}
