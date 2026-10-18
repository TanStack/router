import { createRequire } from 'node:module'
import { test } from 'vitest'
import type {
  AnyRoute,
  AnyRouteMatch,
  AnyRouter,
  GetStoreConfig,
} from '../dist/esm/index.js'
import type { TsrSsrGlobal } from '../dist/esm/ssr/client.js'

const require = createRequire(import.meta.url)
const assert: typeof import('node:assert/strict') = require('node:assert/strict')
const { runInNewContext }: typeof import('node:vm') = require('node:vm')
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
const {
  hydrate,
}: typeof import('../dist/esm/ssr/client.js') = require('../dist/cjs/ssr/client.cjs')
const {
  attachRouterServerSsrUtils,
}: typeof import('../dist/esm/ssr/server.js') = require('../dist/cjs/ssr/server.cjs')

// Rebuild through Nx; use production NODE_ENV and
// NODE_OPTIONS=--conditions=development. Native CJS excludes Vitest module
// instrumentation. Filter one workload with SERIAL_BENCH_CASE. Router creation,
// real server serialization/bootstrap replay and assertions are outside timing.
// SERIAL_BENCH_TIME_MS extends narrow measurements when GC variance is high.
// Fallback includes the public client load that completes hydration recovery.
const workloads = [
  'client-load',
  'preload',
  'no-hook-client-load',
  'no-hook-preload',
  'raw',
  'transformed',
  'transformed-async',
  'rerun',
  'fallback',
  'mixed',
  'rerun-async',
  'assets-sync',
  'assets-async',
  'assets-mixed',
  'assets-sync-client-load',
  'assets-async-client-load',
  'assets-mixed-preload',
] as const
type Workload = (typeof workloads)[number]
type Data = Record<string, number>
type LifecycleArgs = {
  routeId: string
  location: { pathname: string }
  matches: Array<unknown>
  preload: boolean
  cause: string
}
type Calls = {
  inputs: number
  context: number
  beforeLoad: number
  contextHydrate: number
  beforeLoadHydrate: number
  failedHydrate: number
  heads: number
  scripts: number
}
const emptyCalls = (): Calls => ({
  inputs: 0,
  context: 0,
  beforeLoad: 0,
  contextHydrate: 0,
  beforeLoadHydrate: 0,
  failedHydrate: 0,
  heads: 0,
  scripts: 0,
})
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
const locationAtDepth = (depth: number) =>
  `/${Array.from({ length: depth - 1 }, (_, index) => `p${index + 1}`).join('/')}`

function createRouter(
  depth: number,
  workload: Workload,
  server: boolean,
  calls: Calls,
): AnyRouter {
  const consume = (options: LifecycleArgs) => {
    calls.inputs +=
      options.routeId.length +
      options.location.pathname.length +
      options.matches.length +
      Number(options.preload) +
      options.cause.length
  }
  const lifecycle = (kind: 'context' | 'beforeLoad', index: number) => {
    const value = { [`${kind === 'context' ? 'c' : 'b'}${index}`]: index }
    const synchronousHandler = (options: LifecycleArgs) => {
      consume(options)
      calls[kind]++
      return value
    }
    const handler =
      workload === 'rerun-async'
        ? async (options: LifecycleArgs) => {
            await Promise.resolve()
            return synchronousHandler(options)
          }
        : synchronousHandler
    const transform = (options: LifecycleArgs & { data: Data }) => {
      consume(options)
      const { data } = options
      calls[kind === 'context' ? 'contextHydrate' : 'beforeLoadHydrate']++
      if (workload === 'fallback' && kind === 'context' && index === 1) {
        calls.failedHydrate++
        throw new Error('serial hydration fallback')
      }
      return data
    }
    if (workload.startsWith('rerun')) {
      return { handler, dehydrate: false as const }
    }
    return {
      handler,
      dehydrate: true as const,
      hydrate:
        workload === 'raw' || (workload === 'mixed' && index % 4 === 0)
          ? undefined
          : workload === 'transformed-async' ||
              (workload === 'mixed' && index % 4 === 2)
            ? async (options: LifecycleArgs & { data: Data }) => {
                await Promise.resolve()
                return transform(options)
              }
            : transform,
    }
  }
  const noHooks = workload.startsWith('no-hook-')
  const optionsAt = (index: number) =>
    noHooks || (workload === 'mixed' && index % 4 === 3)
      ? {}
      : {
          context: lifecycle('context', index),
          beforeLoad: lifecycle('beforeLoad', index),
          ...(workload.includes('assets-')
            ? {
                head: () => {
                  calls.heads++
                  const data = { meta: [{ title: `asset-${index}` }] }
                  return workload.includes('assets-async') ||
                    (workload.includes('assets-mixed') && index % 2 === 0)
                    ? Promise.resolve(data)
                    : data
                },
                scripts: () => {
                  calls.scripts++
                  const data = [{ children: `asset(${index})` }]
                  return workload.includes('assets-async') ||
                    (workload.includes('assets-mixed') && index % 2 !== 0)
                    ? Promise.resolve(data)
                    : data
                },
              }
            : undefined),
        }
  const root = new BaseRootRoute(optionsAt(0))
  let parent: AnyRoute = root
  for (let index = 1; index < depth; index++) {
    const previous = parent
    const route = new BaseRoute({
      getParentRoute: () => previous,
      path: `p${index}`,
      ...optionsAt(index),
    })
    previous.addChildren([route])
    parent = route
  }
  return new RouterCore(
    {
      routeTree: root,
      history: createMemoryHistory({
        initialEntries: [
          workload.endsWith('preload') ? '/' : locationAtDepth(depth),
        ],
      }),
      isServer: server,
      scrollRestoration: false,
    },
    getStoreConfig,
  )
}

function dispose(router: AnyRouter) {
  router.clearCache()
  router.history.destroy()
  if ((self.__TSR_ROUTER__ as unknown) === router) {
    self.__TSR_ROUTER__ = undefined
  }
}

async function serialize(depth: number, workload: Workload) {
  const calls = emptyCalls()
  const router = createRouter(depth, workload, true, calls)
  attachRouterServerSsrUtils({ router, manifest: { routes: {} } })
  try {
    await router.load()
    await router.serverSsr!.dehydrate()
    assert.equal(calls.context, workload === 'mixed' ? (depth * 3) / 4 : depth)
    assert.equal(
      calls.beforeLoad,
      workload === 'mixed' ? (depth * 3) / 4 : depth,
    )
    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    assert.ok(scripts?.before.length)
    return scripts.before.map((script) => {
      assert.ok(script.children)
      return script.children
    })
  } finally {
    router.serverSsr?.cleanup()
    dispose(router)
  }
}

function replay(scripts: Array<string>) {
  const context: {
    document: { currentScript: { remove: () => void } }
    self?: unknown
    $_TSR?: TsrSsrGlobal
  } = { document: { currentScript: { remove() {} } } }
  context.self = context
  for (const source of scripts) {
    runInNewContext(source, context)
  }
  assert.ok(context.$_TSR)
  return context.$_TSR
}

for (const depth of [4, 16]) {
  for (const workload of workloads) {
    const name = `${workload}, depth ${depth}`
    if (
      process.env.SERIAL_BENCH_CASE &&
      !name.includes(process.env.SERIAL_BENCH_CASE)
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
        const previousBootstrap = window.$_TSR
        const previousRouter = self.__TSR_ROUTER__
        const scripts =
          workload.endsWith('client-load') || workload.endsWith('preload')
            ? undefined
            : await serialize(depth, workload)
        let sample:
          | {
              router: AnyRouter
              calls: Calls
              preloadMatches?: Array<AnyRouteMatch>
            }
          | undefined
        const before = () => {
          assert.equal(sample, undefined)
          const calls = emptyCalls()
          sample = {
            calls,
            router: createRouter(depth, workload, false, calls),
          }
          if (scripts) {
            window.$_TSR = replay(scripts)
          }
        }
        const run = async () => {
          const current = sample!
          if (workload.endsWith('client-load')) {
            await current.router.load()
          } else if (workload.endsWith('preload')) {
            current.preloadMatches = await current.router.preloadRoute({
              to: locationAtDepth(depth),
            })
          } else {
            await hydrate(current.router)
            if (workload === 'fallback') {
              await current.router.load()
            }
          }
        }
        const after = () => {
          const current = sample
          sample = undefined
          if (!current) {
            return
          }
          try {
            const matches =
              current.preloadMatches ?? current.router.state.matches
            assert.equal(matches.length, depth)
            const expected: Data = {}
            for (let index = 0; index < depth; index++) {
              if (
                !workload.startsWith('no-hook-') &&
                !(workload === 'mixed' && index % 4 === 3)
              ) {
                expected[`c${index}`] = index
                expected[`b${index}`] = index
              }
              assert.equal(matches[index]!.status, 'success')
              assert.deepEqual(matches[index]!.context, expected)
              if (workload.includes('assets-')) {
                assert.deepEqual(matches[index]!.meta, [
                  { title: `asset-${index}` },
                ])
                assert.deepEqual(matches[index]!.scripts, [
                  { children: `asset(${index})` },
                ])
              }
            }
            const calls = current.calls
            if (workload === 'raw' || workload.startsWith('no-hook-')) {
              assert.equal(calls.inputs, 0)
            } else {
              assert.ok(calls.inputs > 0 && Number.isFinite(calls.inputs))
            }
            if (workload.startsWith('no-hook-')) {
              assert.deepEqual(calls, emptyCalls())
            } else if (
              workload.endsWith('client-load') ||
              workload.endsWith('preload') ||
              workload.startsWith('rerun')
            ) {
              assert.equal(calls.context, depth)
              assert.equal(calls.beforeLoad, depth)
              assert.equal(calls.contextHydrate, 0)
              assert.equal(calls.beforeLoadHydrate, 0)
            } else if (workload === 'fallback') {
              assert.equal(calls.failedHydrate, 1)
              assert.ok(calls.context > 0)
              assert.ok(calls.beforeLoad > 0)
            } else {
              assert.equal(calls.context, 0)
              assert.equal(calls.beforeLoad, 0)
              assert.equal(
                calls.contextHydrate,
                workload === 'raw'
                  ? 0
                  : workload === 'mixed'
                    ? depth / 2
                    : depth,
              )
              assert.equal(
                calls.beforeLoadHydrate,
                workload === 'raw'
                  ? 0
                  : workload === 'mixed'
                    ? depth / 2
                    : depth,
              )
            }
            assert.equal(calls.heads, workload.includes('assets-') ? depth : 0)
            assert.equal(
              calls.scripts,
              workload.includes('assets-') ? depth : 0,
            )
            if (!workload.endsWith('preload')) {
              assert.equal(
                current.router.state.resolvedLocation?.pathname,
                locationAtDepth(depth),
              )
            }
          } finally {
            dispose(current.router)
            window.$_TSR = previousBootstrap
          }
        }
        try {
          before()
          await run()
          after()
          const result = await bench(
            name,
            { async: true, beforeEach: before, afterEach: after },
            run,
          ).run({
            time: Number(process.env.SERIAL_BENCH_TIME_MS ?? 500),
            iterations: 100,
            warmupTime: 200,
            warmupIterations: 20,
            throws: true,
          })
          console.log(
            JSON.stringify({
              benchmark: 'serial-lifecycle',
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
            dispose(sample.router)
            sample = undefined
          }
          window.$_TSR = previousBootstrap
          self.__TSR_ROUTER__ = previousRouter
        }
      },
      60_000,
    )
  }
}
