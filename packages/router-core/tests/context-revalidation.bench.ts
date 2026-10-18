import { createRequire } from 'node:module'
import { test } from 'vitest'
import type { AnyRoute, AnyRouter, GetStoreConfig } from '../dist/esm/index.js'

const require = createRequire(import.meta.url)
const assert: typeof import('node:assert/strict') = require('node:assert/strict')
const {
  createMemoryHistory,
}: typeof import('@tanstack/history') = require('@tanstack/history')
const {
  batch,
  createAtom,
}: typeof import('@tanstack/store') = require('@tanstack/store')
const {
  isServer,
}: typeof import('../dist/esm/isServer/development.js') = require('@tanstack/router-core/isServer')
const {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
}: typeof import('../dist/esm/index.js') = require('../dist/cjs/index.cjs')

// Build through Nx and run with NODE_ENV=production and
// NODE_OPTIONS=--conditions=development. Native CJS avoids instrumented module
// reads. Each timed operation revalidates the same committed route branch;
// router creation, the initial load, and assertions stay outside timing.
const getStoreConfig: GetStoreConfig = (options) => {
  if (isServer ?? options.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }
  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch,
  }
}

function createSample(depth: number, asynchronous: boolean) {
  const calls = Array.from({ length: depth }, () => 0)
  const contextAt = (index: number) => {
    const run = () => {
      calls[index] = calls[index]! + 1
      return { [`c${index}`]: calls[index] }
    }
    return {
      handler: asynchronous
        ? async () => {
            await Promise.resolve()
            return run()
          }
        : run,
      revalidate: true as const,
    }
  }
  const root = new BaseRootRoute({ context: contextAt(0) })
  let parent: AnyRoute = root
  for (let index = 1; index < depth; index++) {
    const previous = parent
    const route = new BaseRoute({
      getParentRoute: () => previous,
      path: `p${index}`,
      context: contextAt(index),
    })
    previous.addChildren([route])
    parent = route
  }
  const pathname = `/${Array.from({ length: depth - 1 }, (_, index) => `p${index + 1}`).join('/')}`
  const router: AnyRouter = new RouterCore(
    {
      routeTree: root,
      history: createMemoryHistory({ initialEntries: [pathname] }),
      isServer: false,
      scrollRestoration: false,
    },
    getStoreConfig,
  )
  return { router, calls, pathname }
}

type Sample = ReturnType<typeof createSample>

function assertSample(sample: Sample, depth: number, generations: number) {
  assert.equal(sample.router.state.matches.length, depth)
  assert.equal(sample.router.state.resolvedLocation?.pathname, sample.pathname)
  assert.deepEqual(
    sample.calls,
    Array.from({ length: depth }, () => generations),
  )
  const expected: Record<string, number> = {}
  for (let index = 0; index < depth; index++) {
    expected[`c${index}`] = generations
    const match = sample.router.state.matches[index]!
    assert.equal(match.status, 'success')
    assert.deepEqual(match.context, expected)
  }
}

function dispose(sample: Sample) {
  sample.router.clearCache()
  sample.router.history.destroy()
  if ((self.__TSR_ROUTER__ as unknown) === sample.router) {
    self.__TSR_ROUTER__ = undefined
  }
}

for (const depth of [4, 16, 32]) {
  for (const asynchronous of [false, true]) {
    const name = `${asynchronous ? 'async' : 'sync'} context revalidation, depth ${depth}`
    if (
      process.env.CONTEXT_REVALIDATION_BENCH_CASE &&
      !name.includes(process.env.CONTEXT_REVALIDATION_BENCH_CASE)
    ) {
      continue
    }
    test(
      name,
      async ({ bench }) => {
        assert.equal(process.env.NODE_ENV, 'production')
        assert.equal(
          isServer,
          undefined,
          'Use the development isServer condition',
        )
        const previousRouter = self.__TSR_ROUTER__
        let sample: Sample | undefined
        const before = async () => {
          assert.equal(sample, undefined)
          sample = createSample(depth, asynchronous)
          await sample.router.load()
          assertSample(sample, depth, 1)
        }
        const run = async () => {
          await sample!.router.invalidate()
        }
        const after = () => {
          const current = sample
          sample = undefined
          if (!current) {
            return
          }
          try {
            assertSample(current, depth, 2)
          } finally {
            dispose(current)
          }
        }
        try {
          await before()
          await run()
          after()
          const result = await bench(
            name,
            { async: true, beforeEach: before, afterEach: after },
            run,
          ).run({
            time: 500,
            iterations: 100,
            warmupTime: 200,
            warmupIterations: 20,
            throws: true,
          })
          console.log(
            JSON.stringify({
              benchmark: 'context-revalidation',
              name: result.name,
              latencyMs: {
                mean: result.latency.mean,
                p99: result.latency.p99,
                p999: result.latency.p999,
                rme: result.latency.rme,
                sd: result.latency.sd,
                samples:
                  result.latency.samples?.length ?? result.latency.samplesCount,
              },
              throughput: result.throughput.mean,
            }),
          )
        } finally {
          if (sample) {
            dispose(sample)
          }
          self.__TSR_ROUTER__ = previousRouter
        }
      },
      60_000,
    )
  }
}
