import { compilerFingerprint } from './provenance.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { cpus } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const defaultWorkspace = fileURLToPath(new URL('../../', import.meta.url))
const args = process.argv.slice(2)
const value = (name, fallback) => {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}
const root = path.resolve(value('--workspace', defaultWorkspace))
const app = value('--app', 'e2e/react-router/basic-file-based-code-splitting')
const repetitions = Number(value('--repetitions', '5'))
assert.ok(Number.isSafeInteger(repetitions) && repetitions > 0)
const worker = args.includes('--worker')
const profile = args.includes('--profile')
const appRoot = path.resolve(root, app)
function sourceHash(directory) {
  const hash = createHash('sha256')
  function visit(dir) {
    for (const name of readdirSync(dir).sort()) {
      if (
        [
          'node_modules',
          'dist',
          'test-results',
          '.tanstack',
          '.output',
          '.vinxi',
        ].includes(name) ||
        name.startsWith('dist-') ||
        name === 'playwright-report' ||
        name === 'routeTree.gen.ts'
      ) {
        continue
      }
      const file = path.join(dir, name)
      if (statSync(file).isDirectory()) {
        visit(file)
      } else {
        hash
          .update(path.relative(directory, file))
          .update('\0')
          .update(readFileSync(file))
          .update('\0')
      }
    }
  }
  visit(directory)
  return hash.digest('hex')
}

if (!worker) {
  const samples = []
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const start = performance.now()
    const result = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        fileURLToPath(import.meta.url),
        '--worker',
        '--workspace',
        root,
        '--app',
        app,
        ...(profile ? ['--profile'] : []),
      ],
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )
    if (result.status !== 0) {
      throw new Error(`Build failed: ${result.stderr}\n${result.stdout}`)
    }
    const line = result.stdout
      .split('\n')
      .find((candidate) => candidate.startsWith('BENCHMARK_JSON='))
    assert.ok(line, result.stdout)
    const sample = JSON.parse(line.slice(15))
    if (samples.length) {
      assert.equal(
        sample.sourceHash,
        samples[0].sourceHash,
        'App source changed during measurement',
      )
    }
    samples.push({ repetition, wallMs: performance.now() - start, ...sample })
  }
  const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        compilerFingerprint: compilerFingerprint(root),
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: cpus()[0].model,
        app,
        repetitions,
        profile,
        summary: {
          medianBuildMs: median(samples.map((sample) => sample.buildMs)),
          minBuildMs: Math.min(...samples.map((sample) => sample.buildMs)),
          maxBuildMs: Math.max(...samples.map((sample) => sample.buildMs)),
          medianWallMs: median(samples.map((sample) => sample.wallMs)),
          medianPeakRssMiB: median(
            samples.map((sample) => sample.peakRssKiB / 1024),
          ),
        },
        samples,
      },
      null,
      2,
    ),
  )
} else {
  process.chdir(appRoot)
  const { createBuilder } = await import(
    pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js'))
  )
  const hookTimings = {}
  const instrumentation = {
    name: 'compiler-benchmark-observer',
    enforce: 'post',
    configResolved(config) {
      for (const plugin of config.plugins) {
        if (!/tanstack|router|tsr/.test(plugin.name)) {
          continue
        }
        for (const hookName of [
          'buildStart',
          'load',
          'transform',
          'generateBundle',
        ]) {
          const hook = plugin[hookName]
          if (!hook) {
            continue
          }
          const original = typeof hook === 'function' ? hook : hook.handler
          const handler = async function (...parameters) {
            const start = performance.now()
            try {
              return await original.apply(this, parameters)
            } finally {
              const key = `${plugin.name}:${hookName}`
              const metric = (hookTimings[key] ??= { calls: 0, ms: 0 })
              metric.calls++
              metric.ms += performance.now() - start
            }
          }
          plugin[hookName] =
            typeof hook === 'function' ? handler : { ...hook, handler }
        }
      }
    },
  }
  global.gc()
  const before = process.memoryUsage()
  const start = performance.now()
  const builder = await createBuilder({
    root: appRoot,
    logLevel: 'silent',
    plugins: profile ? [instrumentation] : [],
  })
  await builder.buildApp()
  const buildMs = performance.now() - start
  const after = process.memoryUsage()
  global.gc()
  const retained = process.memoryUsage()
  const outputDirectories = new Set(
    Object.values(builder.environments).map((environment) =>
      path.resolve(appRoot, environment.config.build.outDir),
    ),
  )
  let emittedFiles = 0
  let emittedCodeBytes = 0
  const visited = new Set()
  function collectOutput(directory) {
    for (const name of readdirSync(directory)) {
      const file = path.join(directory, name)
      if (visited.has(file)) {
        continue
      }
      visited.add(file)
      if (statSync(file).isDirectory()) {
        collectOutput(file)
      } else {
        emittedFiles++
        if (/\.[cm]?js$/.test(name)) {
          emittedCodeBytes += statSync(file).size
        }
      }
    }
  }
  for (const directory of outputDirectories) {
    collectOutput(directory)
  }
  console.log(
    `BENCHMARK_JSON=${JSON.stringify({ buildMs, sourceHash: sourceHash(appRoot), peakRssKiB: process.resourceUsage().maxRSS, before, after, retained, emittedFiles, emittedCodeBytes, hookTimings })}`,
  )
}
