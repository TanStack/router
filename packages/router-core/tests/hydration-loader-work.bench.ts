import { createRequire } from 'node:module'
import { createHook } from 'node:async_hooks'
import { test } from 'vitest'
import type { AnyRoute, AnyRouter, GetStoreConfig } from '../dist/esm/index.js'
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
}: typeof import('@tanstack/router-core/isServer') = require('@tanstack/router-core/isServer')
const {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  RouterCore,
  notFound,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
}: typeof import('../dist/esm/index.js') = require('../dist/cjs/index.cjs')
const {
  hydrate,
}: typeof import('../dist/esm/ssr/client.js') = require('../dist/cjs/ssr/client.cjs')
const {
  attachRouterServerSsrUtils,
}: typeof import('../dist/esm/ssr/server.js') = require('../dist/cjs/ssr/server.cjs')

// Rebuild router-core through Nx before each baseline/candidate run. Measure
// native production CJS modules to exclude Vitest module-runner instrumentation.
// Use NODE_ENV=production and NODE_OPTIONS=--conditions=development so the native
// isServer export lets this one-process harness select server/client modes.
// Filter with HYDRATION_BENCH_CASE='all-active-sync, depth 16', or a substring.
// No DOM rendering, SSR serialization, bootstrap evaluation, router creation,
// validation, or disposal belongs to the timed hydration call.
const workloads = [
  'no-work',
  'all-active-sync',
  'all-active-async',
  'alternating',
  'rerun-sync',
  'rerun-async',
  'adopt',
  'client-sync',
  'client-async',
  'client-failing-error-shallow',
  'client-failing-error-deep',
  'client-failing-notFound-shallow',
  'client-failing-notFound-deep',
  'terminal-error-shallow',
  'terminal-error-deep',
  'terminal-notFound-shallow',
  'terminal-notFound-deep',
  'selective-pending',
  'selective-pending-context-function',
  'selective-pending-context-object',
] as const
type Workload = (typeof workloads)[number]
type Calls = {
  loaders: number
  hydrates: number
  contexts: number
  contextHydrates: number
  contextDehydrates: number
  gate?: ReturnType<typeof createControlledPromise<void>>
  entered?: ReturnType<typeof createControlledPromise<void>>
}

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

function isActive(workload: Workload, index: number) {
  return (
    workload !== 'no-work' &&
    !workload.startsWith('terminal-') &&
    !workload.startsWith('client-failing-') &&
    !workload.startsWith('selective-pending') &&
    (workload !== 'alternating' || index % 2 === 0)
  )
}

function locationAtDepth(depth: number) {
  return `/${Array.from({ length: depth - 1 }, (_, index) => `p${index + 1}`).join('/')}`
}

function createRouter(
  depth: number,
  workload: Workload,
  server: boolean,
  calls: Calls,
): AnyRouter {
  const failTerminal = server || workload.startsWith('client-failing-')
  const terminalIndex =
    workload.startsWith('terminal-') || workload.startsWith('client-failing-')
      ? workload.endsWith('-shallow')
        ? 1
        : depth - 1
      : undefined
  const pendingContext = workload.startsWith('selective-pending-context-')
  const presentation =
    terminalIndex === undefined
      ? {}
      : {
          errorComponent: () => null,
          notFoundComponent: () => null,
        }
  const ssrAt = (index: number) =>
    workload.startsWith('selective-pending')
      ? index === depth - 1
        ? false
        : index === 1 && !pendingContext
          ? ('data-only' as const)
          : true
      : undefined
  const contextAt = (index: number) => {
    if (!pendingContext) {
      return undefined
    }
    if (!index) {
      return () => {
        calls.contexts++
        return { ancestorContext: server ? 'server' : 'client' }
      }
    }
    if (index !== depth - 1) {
      return undefined
    }
    const handler = ({
      context,
    }: {
      context: { ancestorContext?: string }
    }) => {
      calls.contexts++
      return { leafContext: context.ancestorContext }
    }
    return workload.endsWith('-object')
      ? {
          handler,
          dehydrate: ({ data }: { data: ReturnType<typeof handler> }) => {
            calls.contextDehydrates++
            return data
          },
          hydrate: ({ data }: { data: ReturnType<typeof handler> }) => {
            calls.contextHydrates++
            return data
          },
        }
      : handler
  }
  const loaderAt = (index: number) => {
    const handler = (options: {
      parentMatchPromise?: Promise<{ loaderData?: unknown }>
    }) => {
      calls.loaders++
      if (failTerminal && index === terminalIndex) {
        throw workload.includes('notFound')
          ? notFound()
          : new Error('Terminal loader failed')
      }
      if (workload === 'adopt' && calls.gate) {
        if (calls.loaders === depth) {
          calls.entered!.resolve()
        }
        return index
          ? options.parentMatchPromise!.then(
              (parent) => Number(parent.loaderData) + 1,
            )
          : calls.gate.then(() => 0)
      }
      return workload.endsWith('-async') ? Promise.resolve(index) : index
    }
    if (workload.startsWith('rerun-') || workload === 'adopt') {
      return { handler, dehydrate: false as const }
    }
    if (!isActive(workload, index)) {
      return handler
    }
    const transform = ({ data }: { data: number }) => {
      calls.hydrates++
      return data + 1
    }
    return {
      handler,
      dehydrate: true as const,
      hydrate:
        workload === 'all-active-async'
          ? async (options: { data: number }) => {
              await Promise.resolve()
              return transform(options)
            }
          : transform,
    }
  }
  const rootRoute = new BaseRootRoute({
    ...presentation,
    ssr: ssrAt(0),
    ...(pendingContext ? { context: contextAt(0) } : {}),
    loader: loaderAt(0),
  })
  let parent: AnyRoute = rootRoute
  for (let index = 1; index < depth; index++) {
    const previous = parent
    const route = new BaseRoute({
      getParentRoute: () => previous,
      path: `p${index}`,
      ...presentation,
      ssr: ssrAt(index),
      ...(pendingContext ? { context: contextAt(index) } : {}),
      loader: loaderAt(index),
    })
    previous.addChildren([route])
    parent = route
  }
  return new RouterCore(
    {
      routeTree: rootRoute,
      history: createMemoryHistory({
        initialEntries: [locationAtDepth(depth)],
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
  const calls: Calls = {
    loaders: 0,
    hydrates: 0,
    contexts: 0,
    contextHydrates: 0,
    contextDehydrates: 0,
  }
  const router = createRouter(depth, workload, true, calls)
  attachRouterServerSsrUtils({ router, manifest: { routes: {} } })
  try {
    await router.load()
    await router.serverSsr!.dehydrate()
    assert.equal(
      calls.loaders,
      workload.startsWith('selective-pending') ? depth - 1 : depth,
    )
    assert.equal(calls.hydrates, 0)
    assert.equal(
      calls.contexts,
      workload.startsWith('selective-pending-context-') ? 1 : 0,
    )
    assert.equal(calls.contextHydrates, 0)
    assert.equal(calls.contextDehydrates, 0)
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
      process.env.HYDRATION_BENCH_CASE &&
      !name.includes(process.env.HYDRATION_BENCH_CASE)
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
        const client = workload.startsWith('client-')
        const rerun = workload.startsWith('rerun-') || workload === 'adopt'
        const scripts = client ? undefined : await serialize(depth, workload)
        let sample: { router: AnyRouter; calls: Calls } | undefined
        const before = () => {
          assert.equal(sample, undefined)
          const calls: Calls = {
            loaders: 0,
            hydrates: 0,
            contexts: 0,
            contextHydrates: 0,
            contextDehydrates: 0,
          }
          if (workload === 'adopt') {
            calls.gate = createControlledPromise<void>()
            calls.entered = createControlledPromise<void>()
          }
          const router = createRouter(depth, workload, false, calls)
          sample = { router, calls }
          window.$_TSR = scripts ? replay(scripts) : previousBootstrap
        }
        const run = async () => {
          if (client) {
            await sample!.router.load()
          } else if (workload === 'adopt') {
            const current = sample!
            const hydration = hydrate(current.router)
            await current.calls.entered
            const load = current.router.load({ sync: true })
            await hydration
            current.calls.gate!.resolve()
            await load
          } else {
            await hydrate(sample!.router)
          }
        }
        const after = () => {
          const current = sample
          sample = undefined
          if (!current) {
            return
          }
          try {
            const matches = current.router.state.matches
            assert.equal(matches.length, depth)
            assert.equal(current.calls.loaders, client || rerun ? depth : 0)
            assert.equal(
              current.calls.contexts,
              workload.startsWith('selective-pending-context-') ? 2 : 0,
            )
            assert.equal(current.calls.contextHydrates, 0)
            assert.equal(current.calls.contextDehydrates, 0)
            assert.equal(
              current.calls.hydrates,
              client || rerun
                ? 0
                : matches.filter((_, index) => isActive(workload, index))
                    .length,
            )
            if (
              workload.startsWith('terminal-') ||
              workload.startsWith('client-failing-')
            ) {
              const terminalIndex = workload.endsWith('-shallow')
                ? 1
                : depth - 1
              assert.equal(
                matches[terminalIndex]!.status,
                workload.includes('notFound') ? 'notFound' : 'error',
              )
              for (let index = 0; index < terminalIndex; index++) {
                assert.equal(matches[index]!.status, 'success')
                assert.equal(matches[index]!.loaderData, index)
              }
              assert.equal(
                current.router.state.resolvedLocation?.pathname,
                locationAtDepth(depth),
              )
              return
            }
            if (workload.startsWith('selective-pending-context-')) {
              // Rendered ancestors have no transported context; the first
              // uncommitted client-only leaf must run its handler too.
              for (let index = 0; index < depth - 1; index++) {
                assert.equal(matches[index]!.status, 'success')
                assert.equal(matches[index]!.loaderData, index)
                assert.equal(matches[index]!.context.ancestorContext, 'client')
              }
              assert.equal(matches.at(-1)!.status, 'pending')
              assert.equal(matches.at(-1)!.ssr, false)
              assert.equal(matches.at(-1)!.loaderData, undefined)
              assert.deepEqual(matches.at(-1)!.context, {
                ancestorContext: 'client',
                leafContext: 'client',
              })
              assert.equal(current.router.state.resolvedLocation, undefined)
              return
            }
            if (workload === 'selective-pending') {
              // A rendered ancestor precedes a data-only prefix and an unsent
              // client-only leaf, exercising mixed admission and pending exits.
              assert.equal(matches[0]!.status, 'success')
              assert.equal(matches[0]!.loaderData, 0)
              assert.equal(matches[1]!.status, 'pending')
              assert.equal(matches[1]!.ssr, 'data-only')
              assert.equal(matches.at(-1)!.status, 'pending')
              assert.equal(matches.at(-1)!.loaderData, undefined)
              assert.equal(current.router.state.resolvedLocation, undefined)
              return
            }
            for (const [index, match] of matches.entries()) {
              assert.equal(match.status, 'success')
              assert.equal(
                match.loaderData,
                index + Number(!client && !rerun && isActive(workload, index)),
              )
            }
            assert.equal(
              current.router.state.resolvedLocation?.pathname,
              locationAtDepth(depth),
            )
          } finally {
            dispose(current.router)
            window.$_TSR = previousBootstrap
          }
        }
        try {
          // Assert the public round trip before collecting any timing samples.
          before()
          let promises = 0
          const resources = process.env.HYDRATION_BENCH_RESOURCES
            ? createHook({
                init(_id, type) {
                  if (type === 'PROMISE') {
                    promises++
                  }
                },
              })
            : undefined
          resources?.enable()
          try {
            await run()
          } finally {
            resources?.disable()
          }
          after()
          if (resources) {
            console.log(
              JSON.stringify({
                benchmark: 'hydration-promise-resources',
                name,
                promises,
              }),
            )
          }
          const result = await bench(
            name,
            { beforeEach: before, afterEach: after },
            run,
          ).run({
            time: Number(process.env.HYDRATION_BENCH_TIME_MS ?? 500),
            iterations: 100,
            warmupTime: 100,
            warmupIterations: 20,
            throws: true,
          })
          console.log(
            JSON.stringify({
              benchmark: 'hydration-loader-work',
              name: result.name,
              latencyMs: {
                mean: result.latency.mean,
                p99: result.latency.p99,
                p999: result.latency.p999,
                rmePercent: result.latency.rme,
                sd: result.latency.sd,
                samplesCount: result.latency.samplesCount,
              },
              throughputOpsPerSecond: result.throughput.mean,
              // One measured invocation contributes one latency sample.
              runs: result.latency.samplesCount,
              totalTimeMs: result.totalTime,
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
