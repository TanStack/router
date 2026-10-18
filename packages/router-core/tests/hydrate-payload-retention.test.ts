import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

setFlagsFromString('--expose_gc')
const gc: () => void = runInNewContext('gc')

function createRouter(
  isServer: boolean,
  observeNavigate?: (navigate: object) => void,
) {
  const rootRoute = new BaseRootRoute({ loader: () => ({ root: true }) })
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: ({ navigate }) => {
      observeNavigate?.(navigate)
      return {}
    },
    loader: {
      handler: () => ({ index: true }),
      dehydrate: ({ data }) => [data.index],
      hydrate: ({ data }) => ({ index: data[0]! }),
    },
  })
  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer,
  })
}

test('hydration does not keep the dehydrated matches alive once the bootstrap data is removed', async () => {
  window.$_TSR = await dehydrateToBootstrap(createRouter(true), { routes: {} })
  const payload = new WeakRef(window.$_TSR.router!.matches)
  let navigate: WeakRef<object> | undefined
  const router = createRouter(false, (callback) => {
    navigate = new WeakRef(callback)
  })

  await hydrate(router)
  expect(navigate).toBeDefined()
  // The bootstrap script removes its data once the page hydrated and the
  // stream ended.
  window.$_TSR!.h()
  window.$_TSR!.e()
  delete window.$_TSR
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve))
    gc()
  }

  expect(router.state.matches.map((match) => match.loaderData)).toEqual([
    { root: true },
    { index: true },
  ])
  expect(payload.deref()).toBeUndefined()
  expect(navigate!.deref()).toBeUndefined()
})

test.each([false, true])(
  'releases the wire data of a detached pending loader that self-aborts: %s',
  async (selfAbort) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let wire: WeakRef<object> | undefined
    const build = (isServer: boolean) => {
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: {
          handler: () => 'parent data',
          dehydrate: true,
          hydrate: () => {
            throw new Error('parent transform failed')
          },
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: {
          handler: () => ({ source: isServer ? 'server' : 'client' }),
          dehydrate: ({ data }) => ({ wire: data.source }),
          hydrate: ({ data, abortController }) => {
            wire = new WeakRef(data)
            if (selfAbort) {
              abortController.abort()
            }
            // Application code retains neither the wire data nor this promise.
            return new Promise<{ source: string }>(() => {})
          },
        },
      })
      const elsewhereRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/elsewhere',
      })
      return createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
          elsewhereRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer,
      })
    }
    const router = build(false)
    try {
      window.$_TSR = await dehydrateToBootstrap(build(true), { routes: {} })
      await hydrate(router)
      window.$_TSR!.h()
      window.$_TSR!.e()
      delete window.$_TSR

      await router.load()
      expect(router.state.matches.at(-1)?.loaderData).toEqual({
        source: 'client',
      })
      expect(wire).toBeDefined()
      // The diagnostic observer must not own the failure's native stack,
      // which can itself retain the callback arguments and aborted signals.
      warning.mockClear()
      for (let i = 0; i < 4; i++) {
        await new Promise((resolve) => setTimeout(resolve))
        gc()
      }
      expect(wire!.deref()).toBeUndefined()
    } finally {
      await router.navigate({ to: '/elsewhere' })
      router.clearCache()
      router.history.destroy()
      delete window.$_TSR
      warning.mockRestore()
    }
  },
)

test('releases the completed async beforeLoad contribution while its hydration handoff remains live', async () => {
  let contribution: WeakRef<object> | undefined
  let navigate: WeakRef<object> | undefined
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({})
    const page = new BaseRoute({
      getParentRoute: () => root,
      path: '/',
      beforeLoad: {
        handler: () => ({ ready: true }),
        dehydrate: true,
        hydrate: async (options) => {
          await Promise.resolve()
          const result = { ready: options.data.ready }
          contribution = new WeakRef(result)
          navigate = new WeakRef(options.navigate)
          return result
        },
      },
    })
    return createTestRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer,
    })
  }
  window.$_TSR = await dehydrateToBootstrap(build(true), { routes: {} })
  const router = build(false)
  try {
    await hydrate(router)
    expect(contribution).toBeDefined()
    expect(navigate).toBeDefined()
    window.$_TSR!.h()
    window.$_TSR!.e()
    delete window.$_TSR
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve))
      gc()
    }
    expect(router.state.matches.at(-1)?.context).toEqual({ ready: true })
    expect(contribution!.deref()).toBeUndefined()
    expect(navigate!.deref()).toBeUndefined()
  } finally {
    router.clearCache()
    router.history.destroy()
    delete window.$_TSR
  }
})

test.each([false, true])(
  'releases a reported context transform failure while its handoff remains live: terminal %s',
  async (terminal) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let wire: WeakRef<object> | undefined
    let error: WeakRef<Error> | undefined
    const build = (isServer: boolean) => {
      const root = new BaseRootRoute({ context: () => ({ root: true }) })
      const page = new BaseRoute({
        getParentRoute: () => root,
        path: '/page',
        context: {
          handler: () => ({ page: true }),
          dehydrate: () => ({
            values: Array.from({ length: 2048 }, (_, i) => i),
          }),
          hydrate: ({ data }) => {
            wire = new WeakRef(data)
            const failure = new Error('context transform failed', {
              cause: data,
            })
            error = new WeakRef(failure)
            throw failure
          },
        },
        loader: () => {
          if (terminal) {
            throw new Error('server boundary')
          }
        },
      })
      return createTestRouter({
        routeTree: root.addChildren([page]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer,
      })
    }
    window.$_TSR = await dehydrateToBootstrap(build(true), { routes: {} })
    const router = build(false)
    try {
      await hydrate(router)
      expect(
        router.state.matches.map((match) => [
          match.routeId,
          match.status,
          match.context,
        ]),
      ).toEqual([
        ['__root__', 'success', { root: true }],
        ['/page', terminal ? 'error' : 'pending', { root: true }],
      ])
      expect(warning).toHaveBeenCalledOnce()
      expect(wire).toBeDefined()
      expect(error).toBeDefined()
      window.$_TSR!.h()
      window.$_TSR!.e()
      delete window.$_TSR
      // The warning observer must release its own diagnostic arguments first.
      warning.mockClear()
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setTimeout(resolve))
        gc()
      }
      expect(wire!.deref()).toBeUndefined()
      expect(error!.deref()).toBeUndefined()
    } finally {
      warning.mockRestore()
      router.clearCache()
      router.history.destroy()
      delete window.$_TSR
    }
  },
)

test('releases unreported descendant hydration diagnostics after supersession while ancestor application work stays pending', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const onError = vi.fn()
  const rootStarted = createControlledPromise<void>()
  const childFailed = createControlledPromise<void>()
  // The application retains this operation, but it never captures codec input.
  const applicationWork = new Set([
    new Promise<{ generation: number }>(() => {}),
  ])
  let wire: WeakRef<object> | undefined
  let error: WeakRef<Error> | undefined
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        generation: Number(search.generation ?? 0),
      }),
      loaderDeps: ({ search }) => ({ generation: search.generation }),
      loader: {
        handler: ({ deps }) => ({ generation: deps.generation }),
        dehydrate: true,
        hydrate: () => {
          rootStarted.resolve()
          return applicationWork.values().next().value!
        },
      },
    })
    const page = new BaseRoute({
      getParentRoute: () => root,
      path: '/page',
      onError,
      loader: {
        handler: () => 'page',
        dehydrate: () => ({
          retentionMarker: 'UnreportedDescendantDiagnostic',
          values: Array.from({ length: 2048 }, (_, i) => i),
        }),
        hydrate: ({ data }) => {
          wire = new WeakRef(data)
          const failure = new Error('descendant transform failed', {
            cause: data,
          })
          error = new WeakRef(failure)
          childFailed.resolve()
          throw failure
        },
      },
    })
    const other = new BaseRoute({
      getParentRoute: () => root,
      path: '/other',
      loader: () => 'replacement',
    })
    return createTestRouter({
      routeTree: root.addChildren([page, other]),
      history: createMemoryHistory({ initialEntries: ['/page?generation=0'] }),
      isServer,
    })
  }
  window.$_TSR = await dehydrateToBootstrap(build(true), { routes: {} })
  const router = build(false)
  let hydrationFinished = false
  const hydration = hydrate(router).then(() => {
    hydrationFinished = true
  })
  try {
    await Promise.all([rootStarted, childFailed])
    // Let the throwing loader's outcome reach the Router. The ancestor remains
    // pending, so hydration cannot report the descendant diagnostic yet.
    await new Promise((resolve) => setTimeout(resolve))
    expect(hydrationFinished).toBe(false)
    expect(warning).not.toHaveBeenCalled()
    // A new public root dependency prevents the replacement from adopting the
    // deliberately unresolved root loader generation.
    await router.navigate({ to: '/other', search: { generation: 1 } })
    await expect.poll(() => hydrationFinished, { timeout: 1000 }).toBe(true)
    await hydration
    // Flush the public lazy state snapshot before collection.
    expect(
      router.state.matches.map((match) => [
        match.routeId,
        match.status,
        match.loaderData,
      ]),
    ).toEqual([
      ['__root__', 'success', { generation: 1 }],
      ['/other', 'success', 'replacement'],
    ])
    expect(router.state.location.pathname).toBe('/other')
    expect(onError).not.toHaveBeenCalled()
    expect(warning).not.toHaveBeenCalled()
    expect(wire).toBeDefined()
    expect(error).toBeDefined()
    window.$_TSR!.h()
    window.$_TSR!.e()
    delete window.$_TSR
    warning.mockClear()
    onError.mockClear()
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve))
      gc()
    }
    // Keep only the independent application promise alive through collection.
    expect(applicationWork.size).toBe(1)
    expect(wire!.deref()).toBeUndefined()
    expect(error!.deref()).toBeUndefined()
  } finally {
    // Do not settle the abandoned operation: collection must work while it hangs.
    applicationWork.clear()
    warning.mockRestore()
    router.clearCache()
    router.history.destroy()
    delete window.$_TSR
  }
})
