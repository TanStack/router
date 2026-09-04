import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify, parseArgs } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const execute = promisify(execFile)
const drain = () => new Promise((resolve) => setImmediate(resolve))

// Worker processes never load async_hooks or multiple implementation variants.
if (process.argv[2] === '--worker') {
  const [bundle, mode, depthText, iterationsText, samplesText] =
    process.argv.slice(3)
  globalThis.self = globalThis
  const module = await import(pathToFileURL(bundle).href)
  const fixture =
    mode === 'wait'
      ? module.createWaitBenchmark()
      : await module.createBenchmark(mode, Number(depthText))
  const iterations = Number(iterationsText)
  await fixture.run(iterations * 3)
  await drain()
  fixture.verify()
  const samples = []
  for (let index = 0; index < Number(samplesText); index++) {
    const before = process.cpuUsage()
    const start = performance.now()
    await fixture.run(iterations)
    // Include promise cleanup jobs that outlive the last navigation's waiter.
    await drain()
    const elapsed = performance.now() - start
    const cpu = process.cpuUsage(before)
    samples.push({
      wallUs: (elapsed * 1000) / iterations,
      cpuUs: (cpu.user + cpu.system) / iterations,
    })
    fixture.verify()
  }
  fixture.dispose()
  process.stdout.write(JSON.stringify({ samples }))
} else {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      candidate: { type: 'string' },
      output: { type: 'string' },
      cases: {
        type: 'string',
        default:
          'none:2,cached:8,sync:8,async:8,chunks:8,mixed:8,deferred:8,wait:0',
      },
      pairs: { type: 'string', default: '12' },
      'base-source': { type: 'string' },
      'candidate-source': { type: 'string' },
      control: { type: 'boolean', default: false },
    },
  })
  if (!values.base || !values.candidate || !values.output) {
    throw new Error(
      'Required: --base <worktree> --candidate <worktree> --output <directory>',
    )
  }
  const base = path.resolve(values.base),
    candidate = path.resolve(values.candidate)
  const output = path.resolve(values.output)
  await fs.mkdir(output, { recursive: true })
  const require = createRequire(
    path.join(candidate, 'packages/router-core/package.json'),
  )
  const { build } = require('esbuild')
  for (const [label, root, source] of [
    ['base', base, values['base-source']],
    ['candidate', candidate, values['candidate-source']],
  ]) {
    await build({
      entryPoints: [
        path.join(root, 'packages/router-core/tests/ready-routes.fixture.ts'),
      ],
      outfile: path.join(output, `${label}.mjs`),
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      alias: {
        '@tanstack/router-core/isServer': path.join(
          root,
          'packages/router-core/src/isServer/client.ts',
        ),
        '@tanstack/history': path.join(root, 'packages/history/src/index.ts'),
      },
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: source
        ? [
            {
              name: 'attribution-source',
              setup(plugin) {
                plugin.onLoad(
                  { filter: /[/\\]router-core[/\\]src[/\\]load-client\.ts$/ },
                  async () => ({
                    contents: await fs.readFile(source, 'utf8'),
                    loader: 'ts',
                  }),
                )
              },
            },
          ]
        : [],
    })
  }
  if (values.control) {
    await fs.copyFile(
      path.join(output, 'base.mjs'),
      path.join(output, 'candidate.mjs'),
    )
  }
  const worker = async (label, mode, depth, iterations, samples) => {
    const { stdout } = await execute(
      process.execPath,
      [
        fileURLToPath(import.meta.url),
        '--worker',
        path.join(output, `${label}.mjs`),
        mode,
        String(depth),
        String(iterations),
        String(samples),
      ],
      { maxBuffer: 1024 * 1024 },
    )
    return JSON.parse(stdout)
  }
  const results = []
  for (const spec of values.cases.split(',')) {
    const [mode, depthText] = spec.split(':')
    const depth = Number(depthText)
    const calibration = await worker(
      'base',
      mode,
      depth,
      mode === 'wait' ? 10000 : mode === 'deferred' ? 30 : 1000,
      2,
    )
    const averageUs =
      calibration.samples.reduce((sum, sample) => sum + sample.wallUs, 0) /
      calibration.samples.length
    const iterations = Math.max(2, Math.ceil(350000 / averageUs / 2) * 2)
    const pairs = []
    for (let pair = 0; pair < Number(values.pairs); pair++) {
      const result = {}
      for (const label of pair % 2
        ? ['candidate', 'base']
        : ['base', 'candidate']) {
        result[label] = await worker(label, mode, depth, iterations, 3)
      }
      pairs.push(result)
      await fs.writeFile(
        path.join(output, 'samples.json'),
        JSON.stringify(
          {
            base,
            candidate,
            control: values.control,
            results: [...results, { mode, depth, iterations, pairs }],
          },
          null,
          2,
        ),
      )
    }
    results.push({ mode, depth, iterations, pairs })
    process.stdout.write(
      `Completed ${mode}/${depth}: ${pairs.length} fresh-process pairs\n`,
    )
  }
}
