import { afterEach, expect, onTestFinished, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function createFixture(
  stage:
    | 'component'
    | 'hydrate'
    | 'head'
    | 'scripts'
    | 'context'
    | 'context-error' = 'component',
) {
  const serverRoot = new BaseRootRoute({})
  const serverPage = new BaseRoute({
    getParentRoute: () => serverRoot,
    path: '/page',
    loader: () => 'server data',
  })
  const server = createTestRouter({
    routeTree: serverRoot.addChildren([serverPage]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    isServer: true,
  })
  onTestFinished(() => server.history.destroy())
  const bootstrap = await dehydrateToBootstrap(server, { routes: {} })
  server.history.destroy()
  vi.stubGlobal('window', { $_TSR: bootstrap })

  const chunkStarted = createControlledPromise<void>()
  const chunk = createControlledPromise<void>()
  const loaderStarted = createControlledPromise<void>()
  const loader = createControlledPromise<string>()
  const otherStarted = createControlledPromise<void>()
  const otherLoader = createControlledPromise<string>()
  const operations: Array<Promise<unknown>> = []
  const track = <T>(operation: Promise<T>) => {
    operations.push(operation)
    return operation
  }
  let contexts = 0
  let heads = 0
  let scripts = 0
  const clientLoader = vi.fn(() => {
    loaderStarted.resolve()
    return loader
  })
  const root = new BaseRootRoute({})
  const page = new BaseRoute({
    getParentRoute: () => root,
    path: '/page',
    context: ({ navigate }) => {
      if (
        (stage === 'context' || stage === 'context-error') &&
        ++contexts === 1
      ) {
        track(navigate({ to: '/other' }))
        if (stage === 'context-error') {
          throw new Error('context failed after navigating')
        }
      }
      return {}
    },
    loader: clientLoader,
    head: async () => {
      if (stage === 'head' && ++heads === 1) {
        chunkStarted.resolve()
        await chunk
      }
      return {}
    },
    scripts: async () => {
      if (stage === 'scripts' && ++scripts === 1) {
        chunkStarted.resolve()
        await chunk
      }
      return []
    },
    component: Object.assign(() => null, {
      preload() {
        if (stage === 'component') {
          chunkStarted.resolve()
          return chunk
        }
        return Promise.resolve()
      },
    }),
  })
  const other = new BaseRoute({
    getParentRoute: () => root,
    path: '/other',
    loader: () => {
      otherStarted.resolve()
      return otherLoader
    },
  })
  const router = createTestRouter({
    routeTree: root.addChildren([page, other]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    isServer: false,
    hydrate: () => {
      if (stage === 'hydrate') {
        chunkStarted.resolve()
        return chunk
      }
      return undefined
    },
  })
  const unsubscribe = router.history.subscribe(router.load)
  onTestFinished(async () => {
    unsubscribe()
    chunk.resolve()
    loader.resolve('cleanup')
    otherLoader.resolve('cleanup')
    await Promise.allSettled(operations)
    router.history.destroy()
  })
  const startHydration = () => {
    let settled = false
    let state: typeof router.state | undefined
    const promise = track(
      hydrate(router).then(() => {
        state = router.state
        settled = true
      }),
    )
    return {
      promise,
      get settled() {
        return settled
      },
      get state() {
        return state
      },
    }
  }
  return {
    router,
    chunk,
    chunkStarted,
    loader,
    loaderStarted,
    otherLoader,
    otherStarted,
    clientLoader,
    track,
    startHydration,
  }
}

async function flushMicrotasks() {
  for (let index = 0; index < 20; index++) {
    await Promise.resolve()
  }
}

test('hydration waits for an invalidation that replaces its pending component load', async () => {
  const f = await createFixture()
  const observation = f.startHydration()
  const hydration = observation.promise
  await f.chunkStarted
  const invalidation = f.track(f.router.invalidate({ sync: true }))
  await f.loaderStarted
  await flushMicrotasks()

  expect(f.router.state.matches).toHaveLength(0)
  expect(observation.settled).toBe(false)
  f.loader.resolve('fresh client data')
  f.chunk.resolve()
  await Promise.all([hydration, invalidation])
  expect(observation.state?.matches.at(-1)?.loaderData).toBe(
    'fresh client data',
  )
})

test('hydration follows a later navigation that supersedes the replacing load', async () => {
  const f = await createFixture()
  const observation = f.startHydration()
  const hydration = observation.promise
  await f.chunkStarted
  const invalidation = f.track(f.router.invalidate({ sync: true }))
  await f.loaderStarted
  const navigation = f.track(f.router.navigate({ to: '/other' }))
  await f.otherStarted
  await flushMicrotasks()

  expect(observation.settled).toBe(false)
  f.otherLoader.resolve('winning data')
  await Promise.all([hydration, invalidation, navigation])
  expect(f.router.state.location.pathname).toBe('/other')
  expect(observation.state?.matches.at(-1)?.loaderData).toBe('winning data')
})

test('hydration waits for a replacing loader error to be published', async () => {
  const f = await createFixture()
  const error = new Error('replacing loader failed')
  const observation = f.startHydration()
  const hydration = observation.promise
  await f.chunkStarted
  const invalidation = f.track(f.router.invalidate({ sync: true }))
  await f.loaderStarted
  await flushMicrotasks()

  expect(observation.settled).toBe(false)
  f.loader.reject(error)
  f.chunk.resolve()
  await Promise.all([hydration, invalidation])
  expect(observation.state?.matches.at(-1)).toMatchObject({
    status: 'error',
    error,
  })
})

test('ordinary hydration preserves server data without running the client loader', async () => {
  const f = await createFixture()
  const hydration = f.track(hydrate(f.router))
  await f.chunkStarted
  f.chunk.resolve()
  await hydration

  expect(f.router.state.matches.at(-1)?.loaderData).toBe('server data')
  expect(f.clientLoader).not.toHaveBeenCalled()
})

test('a hydrate callback failure still rejects with the original error', async () => {
  const f = await createFixture()
  const error = new Error('hydrate callback failed')
  f.router.update({
    hydrate: () => {
      throw error
    },
  })
  const hydration = f.track(hydrate(f.router))
  await expect(hydration).rejects.toBe(error)
})

test.each(['hydrate', 'head', 'scripts'] as const)(
  'hydration waits when navigation replaces pending %s work',
  async (stage) => {
    const f = await createFixture(stage)
    const observation = f.startHydration()
    const hydration = observation.promise
    await f.chunkStarted
    const navigation = f.track(f.router.navigate({ to: '/other' }))
    await f.otherStarted
    await flushMicrotasks()
    expect(observation.settled).toBe(false)
    f.otherLoader.resolve('winning data')
    await Promise.all([hydration, navigation])
    expect(observation.state?.matches.at(-1)?.loaderData).toBe('winning data')
    f.chunk.reject(new Error('abandoned work failed later'))
    await flushMicrotasks()
    expect(f.router.state.location.pathname).toBe('/other')
  },
)

test.each(['context', 'context-error'] as const)(
  'hydration waits for a navigation started synchronously from %s',
  async (stage) => {
    const f = await createFixture(stage)
    const observation = f.startHydration()
    const hydration = observation.promise
    await f.otherStarted
    await flushMicrotasks()
    expect(observation.settled).toBe(false)
    f.otherLoader.resolve('winning data')
    await hydration
    expect(f.router.state.location.pathname).toBe('/other')
    expect(observation.state?.matches.at(-1)?.loaderData).toBe('winning data')
  },
)

test('an asynchronous hydrate callback failure retains its error identity', async () => {
  const f = await createFixture('hydrate')
  const error = new Error('async hydrate callback failed')
  const hydration = f.track(hydrate(f.router))
  await f.chunkStarted
  f.chunk.reject(error)
  await expect(hydration).rejects.toBe(error)
})

test('hydration follows a replacing loader redirect until its destination is ready', async () => {
  const f = await createFixture()
  const observation = f.startHydration()
  await f.chunkStarted
  const navigation = f.track(f.router.navigate({ to: '/other' }))
  await f.otherStarted
  f.otherLoader.reject(redirect({ to: '/page' }))
  await f.loaderStarted
  await flushMicrotasks()

  expect(observation.settled).toBe(false)
  f.loader.resolve('redirect destination data')
  f.chunk.resolve()
  await Promise.all([observation.promise, navigation])
  expect(observation.state?.location.pathname).toBe('/page')
  expect(observation.state?.matches.at(-1)?.loaderData).toBe(
    'redirect destination data',
  )
})

test('hydration waits for a replacing loader not-found result to be published', async () => {
  const f = await createFixture()
  const error = notFound({ routeId: '/other', data: 'missing destination' })
  const observation = f.startHydration()
  await f.chunkStarted
  const navigation = f.track(f.router.navigate({ to: '/other' }))
  await f.otherStarted
  await flushMicrotasks()

  expect(observation.settled).toBe(false)
  f.otherLoader.reject(error)
  await Promise.all([observation.promise, navigation])
  expect(observation.state?.location.pathname).toBe('/other')
  expect(observation.state?.matches.at(-1)).toMatchObject({
    status: 'notFound',
    error,
  })
})
