import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compilerFingerprint } from './provenance.mjs'

// Compare rebuilt checkouts through the same public compiler host. Digest runs
// are separate from timings; every pass uses fresh compilers (no output hits).
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}
const workspace = path.resolve(
  option('--workspace', fileURLToPath(new URL('../../', import.meta.url))),
)
const baseline = option('--baseline')
const repetitions = Number(option('--repetitions', '5'))
const iterations = Number(option('--iterations', '8'))
const warmups = Number(option('--warmups', '2'))
const selected = option(
  '--cases',
  'client,ssr,provider,dev,dense,single,control',
).split(',')
const digest = args.includes('--digest')
const hash = (value) => createHash('sha256').update(value).digest('hex')
for (const value of [repetitions, iterations, warmups]) {
  assert.ok(Number.isSafeInteger(value) && value > 0)
}

if (!args.includes('--worker')) {
  const samples = []
  for (const name of selected) {
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const variants = baseline
        ? [
            ['baseline', path.resolve(baseline)],
            ['candidate', workspace],
          ]
        : [['candidate', workspace]]
      if (repetition % 2) {
        variants.reverse()
      }
      for (const [variant, root] of variants) {
        const result = spawnSync(
          process.execPath,
          [
            '--expose-gc',
            fileURLToPath(import.meta.url),
            '--worker',
            '--workspace',
            root,
            '--cases',
            name,
            '--iterations',
            String(iterations),
            '--warmups',
            String(warmups),
            ...(digest ? ['--digest'] : []),
          ],
          {
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
            env: { ...process.env, NODE_ENV: 'production' },
          },
        )
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
        samples.push({ variant, repetition, ...JSON.parse(result.stdout) })
      }
    }
    const subset = samples.filter((sample) => sample.name === name)
    assert.ok(
      subset.every((sample) => sample.sourceHash === subset[0].sourceHash),
    )
    if (digest) {
      assert.ok(
        subset.every((sample) => sample.outputHash === subset[0].outputHash),
        `Code/map mismatch: ${name}`,
      )
    }
  }
  const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const summary = selected.flatMap((name) =>
    [...new Set(samples.map((sample) => sample.variant))].map((variant) => {
      const group = samples.filter(
        (sample) => sample.name === name && sample.variant === variant,
      )
      const values = group.map((sample) => sample.msPerPass)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const sd = Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          Math.max(1, values.length - 1),
      )
      return {
        name,
        variant,
        medianMs: median(values),
        meanMs: mean,
        sdMs: sd,
        cvPercent: (sd / mean) * 100,
        medianPeakRssMiB: median(group.map((sample) => sample.peakRssMiB)),
        medianRetainedHeapMiB: median(
          group.map((sample) => sample.retained.heapUsed / 1024 ** 2),
        ),
      }
    }),
  )
  const output = JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      digest,
      repetitions,
      iterations,
      warmups,
      summary,
      samples,
    },
    null,
    2,
  )
  if (option('--output')) {
    writeFileSync(option('--output'), `${output}\n`)
  } else {
    console.log(output)
  }
} else {
  const name = selected[0]
  assert.ok(
    ['client', 'ssr', 'provider', 'dev', 'dense', 'single', 'control'].includes(
      name,
    ),
  )
  const { createStartCompiler } = await import(
    pathToFileURL(
      path.join(
        workspace,
        'packages/start-plugin-core/dist/esm/start-compiler/host.js',
      ),
    ).href
  )
  const dense = name === 'dense'
  const provider =
    name === 'provider' || name === 'dev' || dense || name === 'single'
  const count = dense ? 1 : 60
  const functions = dense
    ? 150
    : name === 'single'
      ? 1
      : name === 'control'
        ? 0
        : 2
  const sources = Array.from({ length: count }, (_, file) => ({
    id: `/compiler-benchmark/route-${file}.tsx${provider ? '?tss-serverfn-split' : ''}`,
    code: `'use strict';
import { createServerFn } from '@tanstack/react-start';
export const opts = 'unused';
const prefix = '雪-${file}';
${Array.from(
  { length: functions },
  (
    _,
    index,
  ) => `export const fn${index} = createServerFn({method: 'POST'}).validator((data) => data).handler(async (opts) => {
  // Source comment retained with the moved handler.
  return prefix + opts.data + ${index};
});`,
).join('\n')}`,
  }))
  const directives =
    name === 'dev'
      ? [
          'use strict',
          'use server-entry',
          'use server-entry',
          'use "escaped"\\\n雪',
        ]
      : []
  let outputHash
  let outputBytes = 0
  async function compile(check = false) {
    const compiler = createStartCompiler({
      env: name === 'client' ? 'client' : 'server',
      envName: name === 'client' ? 'client' : 'ssr',
      root: '/compiler-benchmark',
      framework: 'react',
      providerEnvName: 'ssr',
      mode: name === 'dev' ? 'dev' : 'build',
      serverFnProviderModuleDirectives: directives,
      encodeModuleSpecifierInDev: ({ extractedFilename }) => extractedFilename,
      getKnownServerFns: () => ({}),
      resolveId: async () => null,
      loadModule: async (id) => {
        throw new Error(`Unexpected load: ${id}`)
      },
    })
    const outputs = digest ? createHash('sha256') : null
    let bytes = 0
    for (const source of sources) {
      const result = await compiler.compile(source)
      if (name === 'control') {
        assert.equal(result, null)
        outputs?.update('null\0')
        continue
      }
      assert.ok(result)
      if (check) {
        const rpc = provider
          ? 'createServerRpc'
          : name === 'client'
            ? 'createClientRpc'
            : 'createSsrRpc'
        assert.equal(result.code.split(`${rpc}(`).length - 1, functions)
        assert.equal(
          result.code.includes('return prefix + opts.data'),
          provider,
        )
        assert.equal(
          result.code.includes('import.meta.webpackHot'),
          name === 'dev',
        )
      }
      if (outputs) {
        outputs
          .update(result.code)
          .update('\0')
          .update(JSON.stringify(result.map))
          .update('\0')
      }
      bytes += result.code.length
    }
    outputHash = outputs?.digest('hex')
    outputBytes = bytes
  }
  await compile(true)
  for (let index = 0; index < warmups; index++) {
    await compile()
  }
  global.gc()
  const before = process.memoryUsage()
  const times = []
  for (let index = 0; index < iterations; index++) {
    const start = performance.now()
    await compile()
    times.push(performance.now() - start)
  }
  global.gc()
  console.log(
    JSON.stringify({
      name,
      sourceHash: hash(JSON.stringify(sources)),
      modules: count,
      functionsPerModule: functions,
      msPerPass: times.reduce((a, b) => a + b, 0) / times.length,
      times,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
      before,
      retained: process.memoryUsage(),
      outputHash,
      outputBytes,
      compilerFingerprint: compilerFingerprint(workspace),
    }),
  )
}
