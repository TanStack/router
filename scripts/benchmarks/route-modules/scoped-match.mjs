import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { realpathSync } from 'node:fs'

// Run only after building router-generator and react-router through Nx.
// Usage: node scripts/benchmarks/route-modules/scoped-match.mjs <repo-root>
// This is a focused CPU probe, not a heap-retention or individual-call-tail test.
const repository = path.resolve(process.argv[2] ?? process.cwd())
const requireGenerator = createRequire(
  path.join(repository, 'packages/router-generator/package.json'),
)
const { Generator, getConfig } = requireGenerator('@tanstack/router-generator')
const { createJiti } = requireGenerator('jiti')
const workspace = realpathSync(
  await fs.mkdtemp(path.join(os.tmpdir(), 'route-module-guard-benchmark-')),
)

async function write(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
}

async function link(root, name, target) {
  const destination = path.join(root, 'node_modules', name)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.symlink(target, destination, 'dir')
}

async function fixture(routeCount) {
  const directory = path.join(workspace, String(routeCount))
  const provider = path.join(directory, 'provider')
  const host = path.join(directory, 'host')
  const moduleId = `@guard/provider-${routeCount}`
  for (const root of [provider, host]) {
    await write(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: root === provider ? moduleId : `@guard/host-${routeCount}`,
        type: 'module',
        dependencies: {
          '@tanstack/react-router': '*',
          ...(root === host ? { [moduleId]: '*' } : {}),
        },
        ...(root === provider
          ? {
              tanstack: { router: { module: true } },
              exports: {
                './route-module': './src/routeModule.gen.ts',
                './route-types': './src/routeContract.gen.ts',
              },
            }
          : {}),
      }),
    )
    await link(
      root,
      '@tanstack/react-router',
      path.join(repository, 'packages/react-router'),
    )
  }
  await link(host, moduleId, provider)
  await write(
    path.join(provider, 'src/routes/__root.tsx'),
    `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})`,
  )
  for (let index = 0; index < routeCount; index++) {
    const segment = `p${String(index).padStart(4, '0')}`
    await write(
      path.join(provider, `src/routes/${segment}.tsx`),
      `import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('${moduleId}:/${segment}')({})`,
    )
  }
  await write(
    path.join(host, 'src/routes/__root.tsx'),
    `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()`,
  )
  await write(
    path.join(host, 'src/routes/outside.tsx'),
    `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/outside')({})`,
  )
  for (const root of [provider, host]) {
    const config = getConfig(
      {
        target: 'react',
        disableLogging: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
        ...(root === host
          ? {
              routeModules: { includes: [{ module: moduleId, at: '/module' }] },
            }
          : {}),
      },
      root,
    )
    await new Generator({ root, config }).run()
  }
  const lastSegment = `p${String(routeCount - 1).padStart(4, '0')}`
  const entry = path.join(host, 'src/benchmark.ts')
  await write(
    entry,
    `import { createRouter, createMemoryHistory } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { isScopedMatch } from '../../provider/src/routeScope.gen'
const history = createMemoryHistory({ initialEntries: ['/module/p0000'] })
const router = createRouter({ routeTree, history, isServer: true })
export { isScopedMatch }
export const first = router.matchRoutes('/module/p0000').at(-1)!
export const lastMatches = router.matchRoutes('/module/${lastSegment}')
export const last = lastMatches.at(-1)!
export const miss = router.matchRoutes('/outside').at(-1)!
export function dispose() { history.destroy() }`,
  )
  const jiti = createJiti(path.join(directory, 'load.mjs'), {
    moduleCache: true,
    fsCache: false,
  })
  const loaded = await jiti.import(entry)
  assert.equal(typeof loaded.isScopedMatch, 'function')
  assert.equal(loaded.first.routeId, `${moduleId}:/p0000`)
  assert.equal(loaded.last.routeId, `${moduleId}:/${lastSegment}`)
  assert.equal(loaded.miss.routeId, '/outside')
  assert.equal(loaded.isScopedMatch(loaded.first), true)
  assert.equal(loaded.isScopedMatch(loaded.last), true)
  assert.equal(loaded.isScopedMatch(loaded.miss), false)
  assert.equal(loaded.lastMatches.filter(loaded.isScopedMatch).length, 2)
  return loaded
}

const BATCH = 1024
const SAMPLE_COUNT = 12
const SAMPLE_MILLISECONDS = 25
let retainedChecksum = 0

function sample(operation, expectedBatchChecksum, duration) {
  const started = performance.now()
  let elapsed = 0
  let batches = 0
  let checksum = 0
  do {
    for (let index = 0; index < BATCH; index++) {
      checksum += operation(index)
    }
    batches++
    elapsed = performance.now() - started
  } while (elapsed < duration)
  assert.equal(checksum, expectedBatchChecksum * batches)
  retainedChecksum += checksum
  return {
    nsPerOperation: (elapsed * 1e6) / (batches * BATCH),
    operations: batches * BATCH,
  }
}

function measure(routeCount, name, operation, expectedBatchChecksum) {
  sample(operation, expectedBatchChecksum, 150)
  const samples = Array.from({ length: SAMPLE_COUNT }, () =>
    sample(operation, expectedBatchChecksum, SAMPLE_MILLISECONDS),
  )
  const means = samples.map((value) => value.nsPerOperation)
  const mean = means.reduce((sum, value) => sum + value, 0) / SAMPLE_COUNT
  const deviation = Math.sqrt(
    means.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (SAMPLE_COUNT - 1),
  )
  const sorted = [...means].sort((left, right) => left - right)
  console.log(
    JSON.stringify({
      benchmark: 'generated-isScopedMatch',
      routes: routeCount,
      name,
      hz: 1e9 / mean,
      meanNsPerOperation: mean,
      standardDeviationNs: deviation,
      rme95Percent:
        ((2.201 * deviation) / Math.sqrt(SAMPLE_COUNT) / mean) * 100,
      // These are percentiles of batch means, not individual-call latency.
      batchMeanP50Ns: sorted[Math.floor(SAMPLE_COUNT * 0.5)],
      batchMeanP95Ns: sorted[Math.ceil(SAMPLE_COUNT * 0.95) - 1],
      samples,
    }),
  )
}

try {
  console.log(
    JSON.stringify({
      node: process.version,
      repository,
      batch: BATCH,
      samples: SAMPLE_COUNT,
    }),
  )
  for (const routeCount of [8, 64, 512]) {
    const fixtureData = await fixture(routeCount)
    const { isScopedMatch, first, last, miss, lastMatches } = fixtureData
    const mixed = [first, last, miss, lastMatches[0]]
    measure(
      routeCount,
      'first leaf hit',
      () => Number(isScopedMatch(first)),
      BATCH,
    )
    measure(
      routeCount,
      'last leaf hit',
      () => Number(isScopedMatch(last)),
      BATCH,
    )
    measure(
      routeCount,
      'ordinary route miss',
      () => Number(isScopedMatch(miss)),
      0,
    )
    measure(
      routeCount,
      'mixed hits and misses',
      (index) => Number(isScopedMatch(mixed[index % mixed.length])),
      BATCH / 2,
    )
    measure(
      routeCount,
      'filter actual ancestor match list',
      () => lastMatches.filter(isScopedMatch).length,
      BATCH * 2,
    )
    fixtureData.dispose()
  }
  console.log(JSON.stringify({ retainedChecksum }))
} finally {
  await fs.rm(workspace, { recursive: true, force: true })
}
