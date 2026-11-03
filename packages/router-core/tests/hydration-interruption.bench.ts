import { createRequire } from 'node:module'
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
  RouterCore,
  createControlledPromise,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
}: typeof import('../dist/esm/index.js') = require('../dist/cjs/index.cjs')
const {
  hydrate,
}: typeof import('../dist/esm/ssr/client.js') = require('../dist/cjs/ssr/client.cjs')
const {
  attachRouterServerSsrUtils,
}: typeof import('../dist/esm/ssr/server.js') = require('../dist/cjs/ssr/server.cjs')

// Rebuild through Nx; use NODE_ENV=production and
// NODE_OPTIONS=--conditions=development. Native CJS excludes Vitest's module
// instrumentation. Router construction, real SSR/bootstrap replay, assertions,
// and draining abandoned application work stay outside timing. A setup-created
// deadline rejects broken samples; it never releases their application work.
// Compare with a baseline supporting interruption: the original implementation
// can wait indefinitely for the application operations these cases hold open.
const workloads = ['early-loader-recovery', 'superseded-serial'] as const
type Workload = (typeof workloads)[number]
type Data = { index: number }

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

function createWork() {
  return {
    entered: createControlledPromise<void>(),
    ancestor: createControlledPromise<void>(),
    release: createControlledPromise<void>(),
    started: [] as Array<number>,
    settled: [] as Array<number>,
    operations: [] as Array<Promise<Data>>,
  }
}

type Work = ReturnType<typeof createWork>

function createRouter(
  depth: number,
  workload: Workload,
  server: boolean,
  work: Work,
): AnyRouter {
  const optionsAt = (index: number) => {
    const transform = async ({ data }: { data: Data }) => {
      work.started.push(index)
      if (workload === 'early-loader-recovery') {
        if (work.started.length === depth) {
          work.entered.resolve()
        }
        if (index === 0) {
          await work.ancestor
        } else if (index === 1) {
          throw new Error('loader hydration failed')
        } else {
          await work.release
        }
      } else if (index === depth - 2) {
        work.entered.resolve()
        await work.release
      }
      work.settled.push(index)
      return data
    }
    const option = {
      handler: () => ({ index }),
      dehydrate: true as const,
      hydrate: (options: { data: Data }) => {
        const operation = transform(options)
        work.operations.push(operation)
        return operation
      },
    }
    return workload === 'early-loader-recovery'
      ? { loader: option }
      : { context: option }
  }
  const root = new BaseRootRoute(optionsAt(0))
  let parent: AnyRoute = root
  let firstChild: AnyRoute | undefined
  for (let index = 1; index < depth; index++) {
    const previous = parent
    const route = new BaseRoute({
      getParentRoute: () => previous,
      path: `p${index}`,
      ...optionsAt(index),
    })
    if (index === 1) {
      firstChild = route
    } else {
      previous.addChildren([route])
    }
    parent = route
  }
  const other = new BaseRoute({
    getParentRoute: () => root,
    path: 'other',
    loader: () => 'other data',
  })
  root.addChildren([firstChild!, other])
  return new RouterCore(
    {
      routeTree: root,
      history: createMemoryHistory({
        initialEntries: [
          `/${Array.from({ length: depth - 1 }, (_, index) => `p${index + 1}`).join('/')}`,
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
  const router = createRouter(depth, workload, true, createWork())
  attachRouterServerSsrUtils({ router, manifest: { routes: {} } })
  try {
    await router.load()
    await router.serverSsr!.dehydrate()
    assert.equal(router.state.matches.length, depth)
    assert.ok(router.state.matches.every((match) => match.status === 'success'))
    const tags = router.serverSsr!.takeInitialHydrationScriptTags()
    assert.ok(tags?.before.length)
    return tags.before.map((tag) => {
      assert.ok(tag.children)
      return tag.children
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
      process.env.HYDRATION_INTERRUPTION_BENCH_CASE &&
      !name.includes(process.env.HYDRATION_INTERRUPTION_BENCH_CASE)
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
        const scripts = await serialize(depth, workload)
        const unhandled: Array<unknown> = []
        const onUnhandled = (reason: unknown) => unhandled.push(reason)
        process.on('unhandledRejection', onUnhandled)
        let sample:
          | {
              router: AnyRouter
              work: Work
              deadline: Promise<never>
              timer: ReturnType<typeof setTimeout>
              hydration?: Promise<void>
              finished: boolean
              finishedBeforeRelease: boolean
              ancestorFinishedAtCompletion: boolean
              error?: unknown
            }
          | undefined
        const before = () => {
          assert.equal(sample, undefined)
          const work = createWork()
          let timer: ReturnType<typeof setTimeout>
          const deadline = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error(`${name} did not settle`)),
              5_000,
            )
          })
          sample = {
            router: createRouter(depth, workload, false, work),
            work,
            deadline,
            timer: timer!,
            finished: false,
            finishedBeforeRelease: false,
            ancestorFinishedAtCompletion: false,
          }
          window.$_TSR = replay(scripts)
        }
        const run = async () => {
          const current = sample!
          current.hydration = hydrate(current.router).then(
            () => {
              current.finished = true
              current.ancestorFinishedAtCompletion =
                current.work.settled.includes(0)
            },
            (error) => {
              current.error = error
              current.finished = true
            },
          )
          await Promise.race([current.work.entered, current.deadline])
          current.finishedBeforeRelease = current.finished
          if (workload === 'early-loader-recovery') {
            current.work.ancestor.resolve()
          } else {
            await Promise.race([
              current.router.navigate({ to: '/other' }),
              current.deadline,
            ])
          }
          await Promise.race([current.hydration, current.deadline])
        }
        const cleanup = async () => {
          const current = sample
          sample = undefined
          if (!current) {
            return
          }
          try {
            // The application work only awaits these gates. Drain its late
            // results outside timing without awaiting broken Router work.
            current.work.ancestor.resolve()
            if (workload === 'superseded-serial') {
              current.work.release.reject(
                new Error('obsolete context rejected'),
              )
            } else {
              current.work.release.resolve()
            }
            await Promise.allSettled(current.work.operations)
            await new Promise((resolve) => setTimeout(resolve, 0))
            if (workload === 'superseded-serial') {
              assert.equal(
                current.router.state.resolvedLocation?.pathname,
                '/other',
              )
              assert.equal(
                current.router.state.matches.at(-1)?.loaderData,
                'other data',
              )
            }
          } finally {
            clearTimeout(current.timer)
            dispose(current.router)
            window.$_TSR = previousBootstrap
          }
        }
        const after = async () => {
          const current = sample!
          try {
            assert.equal(current.error, undefined)
            assert.equal(current.finished, true)
            assert.equal(current.finishedBeforeRelease, false)
            const matches = current.router.state.matches
            if (workload === 'early-loader-recovery') {
              assert.equal(current.ancestorFinishedAtCompletion, true)
              assert.deepEqual(
                current.work.started,
                Array.from({ length: depth }, (_, index) => index),
              )
              assert.deepEqual(current.work.settled, [0])
              assert.equal(matches.length, depth)
              assert.equal(matches[0]!.status, 'success')
              assert.equal(matches[0]!.loaderData.index, 0)
              assert.equal(matches[1]!.status, 'pending')
              assert.equal(current.router.state.resolvedLocation, undefined)
            } else {
              assert.deepEqual(
                current.work.started,
                Array.from({ length: depth - 1 }, (_, index) => index),
              )
              assert.equal(current.router.state.location.pathname, '/other')
              assert.equal(
                current.router.state.resolvedLocation?.pathname,
                '/other',
              )
              assert.equal(matches.length, 2)
              assert.ok(matches.every((match) => match.status === 'success'))
              assert.equal(matches.at(-1)?.loaderData, 'other data')
            }
          } finally {
            await cleanup()
          }
        }
        try {
          before()
          await run()
          await after()
          const result = await bench(
            name,
            { async: true, beforeEach: before, afterEach: after },
            run,
          ).run({
            time: Number(
              process.env.HYDRATION_INTERRUPTION_BENCH_TIME_MS ?? 500,
            ),
            iterations: 100,
            warmupTime: 100,
            warmupIterations: 20,
            throws: true,
          })
          assert.deepEqual(unhandled, [])
          console.log(
            JSON.stringify({
              benchmark: 'hydration-interruption',
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
          await cleanup()
          process.off('unhandledRejection', onUnhandled)
          window.$_TSR = previousBootstrap
          self.__TSR_ROUTER__ = previousRouter
        }
      },
      60_000,
    )
  }
}
