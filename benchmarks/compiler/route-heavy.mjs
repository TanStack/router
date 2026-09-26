import { compilerFingerprint } from './provenance.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const option = (key, fallback) => {
  const index = args.indexOf(key)
  return index === -1 ? fallback : args[index + 1]
}
const workspace = path.resolve(
  option('--workspace', fileURLToPath(new URL('../../', import.meta.url))),
)
const routes = Number(option('--routes', '250'))
const repetitions = Number(option('--repetitions', '5'))
const profileAnalysis = args.includes('--profile-analysis')
const cacheLimit = option('--analysis-cache-limit', null)
if (cacheLimit !== null) {
  assert.ok(Number.isSafeInteger(Number(cacheLimit)) && Number(cacheLimit) > 0)
}
assert.ok(Number.isSafeInteger(routes) && routes > 0)
assert.ok(Number.isSafeInteger(repetitions) && repetitions > 0)
if (!args.includes('--worker')) {
  const samples = []
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const started = performance.now()
    const result = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        fileURLToPath(import.meta.url),
        '--worker',
        '--workspace',
        workspace,
        '--routes',
        String(routes),
        ...(profileAnalysis ? ['--profile-analysis'] : []),
        ...(cacheLimit === null ? [] : ['--analysis-cache-limit', cacheLimit]),
      ],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const line = result.stdout
      .split('\n')
      .find((item) => item.startsWith('BENCHMARK_JSON='))
    assert.ok(line, result.stdout)
    samples.push({
      ...JSON.parse(line.slice(15)),
      wallMs: performance.now() - started,
    })
  }
  assert.ok(
    samples.every((sample) => sample.sourceHash === samples[0].sourceHash),
  )
  const median = (key) =>
    samples.map((sample) => sample[key]).sort((a, b) => a - b)[
      Math.floor(samples.length / 2)
    ]
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        compilerFingerprint: compilerFingerprint(workspace),
        workspace,
        node: process.version,
        cpu: cpus()[0].model,
        routes,
        repetitions,
        ...(cacheLimit === null
          ? {}
          : { analysisCacheLimit: Number(cacheLimit) }),
        summary: {
          medianBuildMs: median('buildMs'),
          medianPeakRssMiB: median('peakRssMiB'),
          medianWallMs: median('wallMs'),
        },
        samples,
      },
      null,
      2,
    ),
  )
} else {
  const analysisCalls = []
  let instrumented = false
  let cacheLimitReplaced = false
  if (profileAnalysis || cacheLimit !== null) {
    globalThis.__tanstackCompilerBenchmarkAnalyses = analysisCalls
    const compilerUrl = pathToFileURL(
      path.join(
        workspace,
        'packages/router-plugin/dist/esm/core/code-splitter/compilers.js',
      ),
    ).href
    const pluginUrl = pathToFileURL(
      path.join(
        workspace,
        'packages/router-plugin/dist/esm/core/router-code-splitter-plugin.js',
      ),
    ).href
    registerHooks({
      load(url, context, nextLoad) {
        const loaded = nextLoad(url, context)
        const profileCompiler = profileAnalysis && url === compilerUrl
        const profileCache = profileAnalysis && url === pluginUrl
        const replaceCacheLimit = cacheLimit !== null && url === pluginUrl
        if (!profileCompiler && !profileCache && !replaceCacheLimit) {
          return loaded
        }
        let source =
          typeof loaded.source === 'string'
            ? loaded.source
            : Buffer.from(loaded.source).toString()
        if (replaceCacheLimit) {
          const original = 'analyzedRoutes.size > 128'
          assert.ok(
            source.includes(original),
            'Cannot locate route analysis cache limit',
          )
          cacheLimitReplaced = true
          source = source.replace(
            original,
            `analyzedRoutes.size > ${cacheLimit}`,
          )
        }
        if (profileCache) {
          const clear = 'analyzedRoutes.clear();'
          assert.ok(
            source.includes(clear),
            'Cannot locate route analysis cache cleanup',
          )
          source = source.replace(
            clear,
            `global.gc();
const cacheBefore = process.memoryUsage();
const cacheEntries = analyzedRoutes.size;
${clear}
global.gc();
globalThis.__tanstackCompilerBenchmarkCache = { entries: cacheEntries, beforeClear: cacheBefore, afterClear: process.memoryUsage() };`,
          )
        }
        if (!profileCompiler) {
          return { ...loaded, source }
        }
        const signature = 'function analyzeRouteModule(options) {'
        assert.ok(
          source.includes(signature),
          'Cannot locate native route analyzer for benchmark instrumentation',
        )
        instrumented = true
        return {
          ...loaded,
          source: source.replace(
            signature,
            signature +
              '\nglobalThis.__tanstackCompilerBenchmarkAnalyses.push(options.filename);',
          ),
        }
      },
    })
  }
  const { build } = await import(
    pathToFileURL(path.join(workspace, 'node_modules/vite/dist/node/index.js'))
      .href
  )
  const { tanstackRouter } = await import(
    pathToFileURL(
      path.join(workspace, 'packages/router-plugin/dist/esm/vite.js'),
    ).href
  )
  const directory = await mkdtemp(
    path.join(workspace, 'packages/router-plugin/.compiler-benchmark-'),
  )
  const hash = createHash('sha256')
  const source = async (file, code) => {
    hash.update(file).update('\0').update(code)
    await writeFile(path.join(directory, file), code)
  }
  try {
    await mkdir(path.join(directory, 'routes'))
    await source(
      'index.html',
      '<div id="app"></div><script type="module" src="/entry.ts"></script>',
    )
    await source(
      'entry.ts',
      `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
createRoot(document.getElementById('app')!).render(createElement(RouterProvider, { router }))`,
    )
    await source(
      'routes/__root.tsx',
      `import { createElement } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => createElement(Outlet) })`,
    )
    for (let i = 0; i < routes; i++) {
      const id = `route-${String(i).padStart(4, '0')}`
      await source(
        `routes/${id}.tsx`,
        `import { createElement } from 'react'
import { createFileRoute } from '@tanstack/react-router'
const seed = makeSeed(${i})
const { state, increment } = makeState(seed)
const labels = ${JSON.stringify(Array.from({ length: 32 }, (_, index) => `Route ${i} item ${index}`))}
export const Route = createFileRoute('/${id}')({
  beforeLoad: () => ({ state }),
  loader: async () => { increment(); return state },
  component: () => createElement('section', null, labels.map((label, index) => createElement('p', { key: index }, label, ':', state.value))),
  pendingComponent: () => createElement('span', null, 'Loading ${id}'),
  errorComponent: ({ error }: { error: Error }) => createElement('pre', null, error.message),
})
function makeSeed(value: number) { return { value } }
function makeState(state: { value: number }) { return { state, increment: () => state.value++ } }`,
      )
    }
    global.gc()
    const before = process.memoryUsage()
    const started = performance.now()
    const output = await build({
      root: directory,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
          codeSplittingOptions: {
            addHmr: false,
            defaultBehavior: [
              ['loader'],
              ['component'],
              ['pendingComponent', 'errorComponent'],
            ],
          },
        }),
      ],
      build: { outDir: 'dist', minify: true, sourcemap: true },
    })
    const buildMs = performance.now() - started
    const after = process.memoryUsage()
    global.gc()
    const retained = process.memoryUsage()
    const bundles = Array.isArray(output) ? output : [output]
    let chunks = 0
    let emittedJsBytes = 0
    for (const bundle of bundles) {
      for (const item of bundle.output ?? []) {
        if (item.type === 'chunk') {
          chunks++
          emittedJsBytes += Buffer.byteLength(item.code)
        }
      }
    }
    const analysesByFile = {}
    if (profileAnalysis) {
      assert.ok(
        instrumented,
        'Native route analyzer instrumentation was not loaded',
      )
      for (const filename of analysisCalls) {
        const name = path.relative(directory, filename)
        analysesByFile[name] = (analysesByFile[name] ?? 0) + 1
      }
    }
    if (cacheLimit !== null) {
      assert.ok(
        cacheLimitReplaced,
        'Route analysis cache override was not loaded',
      )
    }
    console.log(
      `BENCHMARK_JSON=${JSON.stringify({ buildMs, peakRssMiB: process.resourceUsage().maxRSS / 1024, sourceHash: hash.digest('hex'), chunks, emittedJsBytes, before, after, retained, ...(profileAnalysis ? { analyzerCalls: analysisCalls.length, analysesByFile, liveCache: globalThis.__tanstackCompilerBenchmarkCache } : {}) })}`,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
