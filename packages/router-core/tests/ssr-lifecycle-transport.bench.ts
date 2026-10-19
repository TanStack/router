import { createRequire } from 'node:module'
import { test } from 'vitest'
import type { AnyRoute, AnyRouter, GetStoreConfig } from '../dist/esm/index.js'
import type { TsrSsrGlobal } from '../dist/esm/ssr/client.js'

const require = createRequire(import.meta.url)
const assert: typeof import('node:assert/strict') = require('node:assert/strict')
const { runInNewContext }: typeof import('node:vm') = require('node:vm')
const {
  ReadableStream,
}: typeof import('node:stream/web') = require('node:stream/web')
const {
  createMemoryHistory,
}: typeof import('@tanstack/history') = require('@tanstack/history')
const {
  isServer,
}: typeof import('@tanstack/router-core/isServer') = require('@tanstack/router-core/isServer')
const {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
}: typeof import('../dist/esm/index.js') = require('../dist/cjs/index.cjs')
const {
  attachRouterServerSsrUtils,
  transformReadableStreamWithRouter,
}: typeof import('../dist/esm/ssr/server.js') = require('../dist/cjs/ssr/server.cjs')

// Build through Nx and run NODE_ENV=production. Native CJS excludes Vitest's
// module instrumentation. Time lifecycle settlement, dehydration, complete
// response-body consumption and SSR cleanup. Router creation, route-tree setup,
// bootstrap evaluation and assertions are outside timing. This isolates Router
// SSR; it does not measure a framework renderer or Start request middleware.
const workloads = [
  'ordinary-sync-context',
  'ordinary-async-context',
  'raw-transport',
  'sync-codecs',
  'async-codecs',
  'deferred-unsent',
  'deferred-codec',
] as const
type Workload = (typeof workloads)[number]
type Data = { id: number; pending?: Promise<string> }
type Calls = {
  context: number
  beforeLoad: number
  loader: number
  dehydrate: number
  hydrate: number
  aborted: number
  cleanup: Array<boolean>
}

const getStoreConfig: GetStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn) => fn(),
})

function createSample(depth: number, workload: Workload) {
  const calls: Calls = {
    context: 0,
    beforeLoad: 0,
    loader: 0,
    dehydrate: 0,
    hydrate: 0,
    aborted: 0,
    cleanup: [],
  }
  const signals: Array<AbortSignal> = []
  const codecs = workload === 'sync-codecs' || workload === 'async-codecs'
  const deferred = workload.startsWith('deferred-')
  const serialAt = (kind: 'context' | 'beforeLoad', index: number) => {
    const key = `${kind === 'context' ? 'c' : 'b'}${index}`
    const run = () => {
      calls[kind]++
      return { [key]: index }
    }
    const handler =
      kind === 'context' && workload === 'ordinary-async-context'
        ? async () => {
            await Promise.resolve()
            return run()
          }
        : run
    if (codecs) {
      const dehydrate = ({ data }: { data: Record<string, number> }) => {
        calls.dehydrate++
        return [key, data[key]]
      }
      return {
        handler,
        dehydrate:
          workload === 'async-codecs'
            ? async (options: { data: Record<string, number> }) => {
                await Promise.resolve()
                return dehydrate(options)
              }
            : dehydrate,
        hydrate: ({ data }: { data: [string, number] }) => {
          calls.hydrate++
          return { [data[0]]: data[1] }
        },
      }
    }
    return workload === 'raw-transport'
      ? { handler, dehydrate: true as const }
      : handler
  }
  const optionsAt = (index: number) => {
    const handler = ({
      abortController,
    }: {
      abortController: AbortController
    }): Data => {
      calls.loader++
      signals.push(abortController.signal)
      if (!deferred) {
        return { id: index }
      }
      return {
        id: index,
        pending: new Promise<string>((_resolve, reject) => {
          abortController.signal.addEventListener(
            'abort',
            () => {
              calls.aborted++
              reject(abortController.signal.reason)
            },
            { once: true },
          )
        }),
      }
    }
    const dehydrate = ({ data }: { data: Data }) => {
      calls.dehydrate++
      return data.id
    }
    const hydrate = ({ data }: { data: number }) => {
      calls.hydrate++
      return { id: data }
    }
    return {
      context: serialAt('context', index),
      beforeLoad: serialAt('beforeLoad', index),
      loader:
        workload === 'deferred-unsent'
          ? { handler, dehydrate: false as const }
          : codecs || workload === 'deferred-codec'
            ? {
                handler,
                dehydrate:
                  workload === 'async-codecs'
                    ? async (options: { data: Data }) => {
                        await Promise.resolve()
                        return dehydrate(options)
                      }
                    : dehydrate,
                hydrate,
              }
            : workload === 'raw-transport'
              ? { handler, dehydrate: true as const }
              : handler,
    }
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
  const pathname = `/${Array.from({ length: depth - 1 }, (_, index) => `p${index + 1}`).join('/')}`
  const router: AnyRouter = new RouterCore(
    {
      routeTree: root,
      history: createMemoryHistory({ initialEntries: [pathname] }),
      isServer: true,
      scrollRestoration: false,
    },
    getStoreConfig,
  )
  attachRouterServerSsrUtils({ router, manifest: { routes: {} } })
  router.serverSsr!.onCleanup((settled) => calls.cleanup.push(settled))
  return { router, calls, signals, pathname, body: '' }
}

type Sample = ReturnType<typeof createSample>

async function run(sample: Sample) {
  await sample.router.load()
  const serverSsr = sample.router.serverSsr!
  await serverSsr.dehydrate()
  const tags = serverSsr.takeInitialHydrationScriptTags()!
  const scripts = [...tags.before, tags.boundary]
    .map((tag) => `<script>${tag.children ?? ''}</script>`)
    .join('')
  const values = sample.router.state.matches
    .map((match) => (match.loaderData as Data).id)
    .join(',')
  const html = `<!DOCTYPE html><html><body><main>${values}</main>${scripts}</body></html>`
  const appStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(html))
      controller.close()
    },
  })
  const output = transformReadableStreamWithRouter(sample.router, appStream)
  sample.body = await new Response(output).text()
}

function assertSample(sample: Sample, depth: number, workload: Workload) {
  const { router, calls, signals, body } = sample
  const codecs = workload === 'sync-codecs' || workload === 'async-codecs'
  const contextTransported = codecs || workload === 'raw-transport'
  const context: Record<string, number> = {}
  assert.equal(router.state.matches.length, depth)
  for (let index = 0; index < depth; index++) {
    context[`c${index}`] = index
    context[`b${index}`] = index
    const match = router.state.matches[index]!
    assert.equal(match.status, 'success')
    assert.deepEqual(match.context, context)
    assert.equal((match.loaderData as Data).id, index)
  }
  assert.equal(router.state.resolvedLocation?.pathname, sample.pathname)
  assert.equal(calls.context, depth)
  assert.equal(calls.beforeLoad, depth)
  assert.equal(calls.loader, depth)
  assert.equal(
    calls.dehydrate,
    codecs ? depth * 3 : workload === 'deferred-codec' ? depth : 0,
  )
  assert.equal(calls.hydrate, 0)
  assert.equal(calls.aborted, workload.startsWith('deferred-') ? depth : 0)
  assert.equal(signals.length, depth)
  assert.ok(
    signals.every(
      (signal) =>
        signal.aborted === (codecs || workload.startsWith('deferred-')),
    ),
  )
  assert.deepEqual(calls.cleanup, [true])
  assert.equal(router.serverSsr, undefined)
  assert.ok(body.startsWith('<!DOCTYPE html>'))
  assert.ok(body.endsWith('</body></html>'))
  assert.ok(
    body.includes(
      `<main>${Array.from({ length: depth }, (_, index) => index).join(',')}</main>`,
    ),
  )

  const bootstrap: {
    document: { currentScript: { remove: () => void } }
    self?: unknown
    $_TSR?: TsrSsrGlobal
  } = { document: { currentScript: { remove() {} } } }
  bootstrap.self = bootstrap
  for (const script of body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    runInNewContext(script[1]!, bootstrap)
  }
  // Cross-realm objects use different prototypes; JSON compares wire values.
  const matches = JSON.parse(
    JSON.stringify(bootstrap.$_TSR!.router!.matches),
  ) as Array<Record<string, unknown>>
  assert.equal(matches.length, depth)
  for (let index = 0; index < depth; index++) {
    const match = matches[index]!
    assert.equal('m' in match, contextTransported)
    if (contextTransported) {
      assert.deepEqual(
        match.m,
        codecs ? [`c${index}`, index] : { [`c${index}`]: index },
      )
    }
    assert.deepEqual(
      match.b,
      codecs ? [`b${index}`, index] : { [`b${index}`]: index },
    )
    assert.equal('l' in match, workload !== 'deferred-unsent')
    if (workload !== 'deferred-unsent') {
      assert.deepEqual(
        match.l,
        codecs || workload === 'deferred-codec' ? index : { id: index },
      )
    }
  }
}

function dispose(sample: Sample) {
  sample.router.serverSsr?.cleanup()
  sample.router.history.destroy()
}

for (const depth of [4, 16]) {
  for (const workload of workloads) {
    const name = `${workload}, depth ${depth}`
    if (
      process.env.SSR_LIFECYCLE_BENCH_CASE &&
      !name.includes(process.env.SSR_LIFECYCLE_BENCH_CASE)
    ) {
      continue
    }
    test(
      name,
      async ({ bench }) => {
        assert.equal(process.env.NODE_ENV, 'production')
        assert.notEqual(
          isServer,
          false,
          'Use node or development isServer conditions',
        )
        let sample: Sample | undefined
        const unhandled: Array<unknown> = []
        const onUnhandled = (reason: unknown) => unhandled.push(reason)
        process.on('unhandledRejection', onUnhandled)
        const before = () => {
          assert.equal(sample, undefined)
          sample = createSample(depth, workload)
        }
        const after = () => {
          const current = sample
          sample = undefined
          if (!current) {
            return
          }
          try {
            assertSample(current, depth, workload)
          } finally {
            dispose(current)
          }
        }
        try {
          before()
          await run(sample!)
          after()
          const result = await bench(
            name,
            { async: true, beforeEach: before, afterEach: after },
            async () => {
              await run(sample!)
            },
          ).run({
            time: Number(process.env.SSR_LIFECYCLE_BENCH_TIME_MS ?? 500),
            iterations: 100,
            warmupTime: 200,
            warmupIterations: 20,
            throws: true,
          })
          // Allow cleanup-triggered promise rejections to reach the event loop.
          await new Promise((resolve) => setTimeout(resolve, 0))
          assert.deepEqual(unhandled, [])
          console.log(
            JSON.stringify({
              benchmark: 'ssr-lifecycle-transport',
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
          process.off('unhandledRejection', onUnhandled)
        }
      },
      60_000,
    )
  }
}
