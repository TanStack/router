import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { cpus } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compilerFingerprint } from './provenance.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}
const workspace = path.resolve(
  option('--workspace', fileURLToPath(new URL('../../', import.meta.url))),
)
const baseline = option('--baseline')
const routes = Number(option('--routes', '64'))
const helpers = Number(option('--helpers', '12'))
const groups = Number(option('--groups', '4'))
const repetitions = Number(option('--repetitions', '7'))
const diagnostic = args.includes('--diagnostic')
for (const count of [routes, helpers, groups, repetitions]) {
  assert.ok(Number.isSafeInteger(count) && count > 0)
}
assert.ok([1, 4].includes(groups))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

if (!args.includes('--worker')) {
  const samples = []
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
          '--routes',
          String(routes),
          '--helpers',
          String(helpers),
          '--groups',
          String(groups),
          ...(diagnostic ? ['--diagnostic'] : []),
        ],
        {
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
          env: { ...process.env, NODE_ENV: 'production' },
        },
      )
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      const line = result.stdout
        .split('\n')
        .find((line) => line.startsWith('BENCHMARK_JSON='))
      assert.ok(line, result.stdout)
      const sample = { variant, repetition, ...JSON.parse(line.slice(15)) }
      samples.push(sample)
      process.stderr.write(
        `${variant} ${repetition + 1}/${repetitions}: ${sample.buildMs.toFixed(1)} ms\n`,
      )
    }
  }
  for (const key of ['sourceHash', 'outputHash', 'chunks', 'emittedJsBytes']) {
    assert.ok(
      samples.every((sample) => sample[key] === samples[0][key]),
      `${key} mismatch`,
    )
  }
  const summary = [...new Set(samples.map((sample) => sample.variant))].map(
    (variant) => {
      const group = samples.filter((sample) => sample.variant === variant)
      for (const sample of group) {
        assert.deepEqual(
          sample.compilerFingerprint,
          group[0].compilerFingerprint,
        )
      }
      const values = group.map((sample) => sample.buildMs)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const sd = Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          Math.max(1, values.length - 1),
      )
      return {
        variant,
        medianBuildMs: median(values),
        meanBuildMs: mean,
        sdMs: sd,
        cvPercent: (sd / mean) * 100,
        medianGraphMs: median(group.map((sample) => sample.graphMs)),
        medianPeakRssMiB: median(group.map((sample) => sample.peakRssMiB)),
      }
    },
  )
  const pairedChanges = baseline
    ? Array.from({ length: repetitions }, (_, repetition) => {
        const pair = samples.filter(
          (sample) => sample.repetition === repetition,
        )
        const before = pair.find(
          (sample) => sample.variant === 'baseline',
        ).buildMs
        const after = pair.find(
          (sample) => sample.variant === 'candidate',
        ).buildMs
        return {
          repetition,
          deltaMs: after - before,
          deltaPercent: (after / before - 1) * 100,
        }
      })
    : []
  const result = JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      node: process.version,
      cpu: cpus()[0].model,
      routes,
      helpersPerGroup: helpers,
      groups,
      repetitions,
      diagnosticOnly: diagnostic,
      summary,
      pairedChanges,
      samples,
    },
    null,
    2,
  )
  if (option('--output')) {
    await writeFile(option('--output'), result + '\n')
  } else {
    console.log(result)
  }
} else {
  const profile = {
    requests: [],
    analyses: [],
    metadataBuilds: 0,
    cleanupCalls: 0,
    cleanupMs: 0,
  }
  const weakAnalyses = []
  if (diagnostic) {
    globalThis.__cleanupBuildProfile = profile
    globalThis.__cleanupBuildWeakAnalyses = weakAnalyses
    registerHooks({
      load(url, context, nextLoad) {
        const loaded = nextLoad(url, context)
        const routerPlugin = url.endsWith(
          '/router-plugin/dist/esm/core/router-code-splitter-plugin.js',
        )
        const utils = url.endsWith('/router-utils/dist/esm/compiler-helpers.js')
        if (!routerPlugin && !utils) {
          return loaded
        }
        let source =
          typeof loaded.source === 'string'
            ? loaded.source
            : Buffer.from(loaded.source).toString()
        const replace = (before, after) => {
          assert.equal(
            source.split(before).length,
            2,
            `Expected one instrumentation target: ${before}`,
          )
          source = source.replace(before, after)
        }
        if (routerPlugin) {
          replace(
            'function getRouteAnalysis(code, id) {',
            'function getRouteAnalysis(code, id) { globalThis.__cleanupBuildProfile.requests.push(id);',
          )
          replace(
            'analyzedRoutes.set(filename, {',
            'globalThis.__cleanupBuildProfile.analyses.push(filename); globalThis.__cleanupBuildWeakAnalyses.push(new WeakRef(analysis)); analyzedRoutes.set(filename, {',
          )
          replace('buildEnd() {', 'async buildEnd() {')
          replace(
            'analyzedRoutes.clear();',
            `global.gc();
          globalThis.__cleanupBuildProfile.cacheEntriesAtBuildEnd = analyzedRoutes.size;
          globalThis.__cleanupBuildProfile.beforeClear = process.memoryUsage();
          analyzedRoutes.clear();
          await new Promise(setImmediate); global.gc();
          globalThis.__cleanupBuildProfile.afterClear = process.memoryUsage();
          globalThis.__cleanupBuildProfile.analysesAliveAfterClear = globalThis.__cleanupBuildWeakAnalyses.filter(ref => ref.deref()).length;`,
          )
        } else {
          const cached = source.includes('function createCleanupMetadata(')
          const call = cached
            ? 'const graph = declarationIndex(sourceModule, sourceModule.symbols);'
            : 'const graph = declarationIndex(module, module.symbols);'
          replace(
            call,
            'globalThis.__cleanupBuildProfile.metadataBuilds++; ' + call,
          )
          // Instrument cleanup as a whole, including metadata construction on first use.
          // Factory calls construct metadata before cleanupBindings, so wrap both.
          const names = cached
            ? ['cleanupBindings', 'createCleanupMetadata']
            : ['removeUnusedBindings']
          source += names
            .map(
              (
                name,
              ) => `\nconst benchmarkOriginal_${name} = ${name}; ${name} = function(...args) {
          const start = performance.now();
          ${name === 'createCleanupMetadata' ? '' : 'globalThis.__cleanupBuildProfile.cleanupCalls++;'}
          try { return benchmarkOriginal_${name}(...args); }
          finally { globalThis.__cleanupBuildProfile.cleanupMs += performance.now() - start; }
        };`,
            )
            .join('\n')
        }
        return { ...loaded, source }
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
    path.join(workspace, 'packages/router-plugin/.cleanup-build-'),
  )
  const sourceHasher = createHash('sha256')
  const source = async (file, code) => {
    sourceHasher.update(file).update('\0').update(code).update('\0')
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
    const targets = [
      'loader',
      'component',
      'pendingComponent',
      'errorComponent',
    ]
    for (let route = 0; route < routes; route++) {
      const id = `route-${String(route).padStart(4, '0')}`
      const declarations = targets
        .flatMap((target) =>
          Array.from(
            { length: helpers },
            (_, index) => `
function ${target}Field${index}(record: Record<string, unknown>) {
  const key = '${target}-${index}'
  const raw = record[key] ?? '${id}-${target}-${index}'
  function normalize(value: unknown) {
    const text = String(value).trim()
    const parts = text.split(/\\s+/)
    return parts.map((part, position) => {
      const prefix = position === 0 ? key : String(position)
      return prefix + ':' + part.toLowerCase()
    }).join(' ')
  }
  return normalize(raw)
}`,
          ),
        )
        .join('\n')
      const pipeline = (target, value) =>
        `[${Array.from({ length: helpers }, (_, i) => `${target}Field${i}(${value})`).join(',')}]`
      await source(
        `routes/${id}.tsx`,
        `import { createElement } from 'react'
import { createFileRoute } from '@tanstack/react-router'
const state = { visits: 0 }
${declarations}
export const Route = createFileRoute('/${id}')({
  beforeLoad: () => { state.visits++; return { visits: state.visits } },
  loader: async ({ context }) => ${pipeline('loader', 'context')},
  component: () => {
    const data = Route.useLoaderData()
    return createElement('section', null, state.visits, ${pipeline('component', 'data')}.join(' | '))
  },
  pendingComponent: () => createElement('span', null, ${pipeline('pendingComponent', '{}')}.join(' | ')),
  errorComponent: ({ error }) => createElement('pre', null, ${pipeline('errorComponent', 'error')}.join(' | ')),
})`,
      )
    }
    global.gc()
    let graphMs
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
            defaultBehavior:
              groups === 1 ? [targets] : targets.map((target) => [target]),
          },
        }),
        {
          name: 'cleanup-benchmark-phases',
          buildEnd() {
            graphMs = performance.now() - started
          },
        },
      ],
      build: { outDir: 'dist', minify: true, sourcemap: true },
    })
    const buildMs = performance.now() - started
    if (diagnostic) {
      assert.equal(profile.cleanupCalls, routes * (groups + 2))
      assert.ok(profile.metadataBuilds > 0)
      assert.ok(profile.metadataBuilds <= profile.cleanupCalls)
      assert.equal(profile.analysesAliveAfterClear, 0)
    }
    const bundles = Array.isArray(output) ? output : [output]
    const chunks = bundles
      .flatMap((bundle) => bundle.output ?? [])
      .filter((item) => item.type === 'chunk')
    // Stable chunk names make full code equality meaningful, without discarding bodies.
    const code = chunks
      .map((item) => [item.fileName, item.code])
      .sort(([a], [b]) => a.localeCompare(b))
    assert.equal(
      chunks.length,
      routes * groups + 1,
      'Expected each split group plus the application entry',
    )
    for (let route = 0; route < routes; route++) {
      for (const target of targets) {
        const marker = `route-${String(route).padStart(4, '0')}-${target}-${helpers - 1}`
        assert.ok(
          chunks.some((item) => item.code.includes(marker)),
          `Missing live helper: ${marker}`,
        )
      }
    }
    global.gc()
    const result = {
      buildMs,
      graphMs,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
      sourceHash: sourceHasher.digest('hex'),
      outputHash: hash(JSON.stringify(code)),
      chunks: chunks.length,
      emittedJsBytes: chunks.reduce(
        (sum, item) => sum + Buffer.byteLength(item.code),
        0,
      ),
      retained: process.memoryUsage(),
      compilerFingerprint: compilerFingerprint(workspace),
      ...(diagnostic
        ? {
            profile: {
              ...profile,
              requests: profile.requests.map((file) =>
                path.relative(directory, file),
              ),
              analyses: profile.analyses.map((file) =>
                path.relative(directory, file),
              ),
            },
          }
        : {}),
    }
    console.log(`BENCHMARK_JSON=${JSON.stringify(result)}`)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
