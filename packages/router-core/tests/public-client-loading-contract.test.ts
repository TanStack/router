import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('public client loading contracts', () => {
  test('blocking loading is observable through match isFetching', async () => {
    const loaderGate = createControlledPromise<string>()
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      pendingMs: 0,
      pendingComponent: () => null,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const navigation = router.navigate({ to: '/target' })

    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    await vi.waitFor(() =>
      expect(
        router.state.matches.find((match) => match.routeId === targetRoute.id),
      ).toMatchObject({ status: 'pending', isFetching: 'loader' }),
    )

    loaderGate.resolve('target data')
    await navigation

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      isFetching: false,
      loaderData: 'target data',
    })
  })

  test('background loading is observable while retaining committed data', async () => {
    const reloadGate = createControlledPromise<{ generation: number }>()
    let loaderCalls = 0
    const loader = vi.fn(() =>
      ++loaderCalls === 1 ? { generation: 1 } : reloadGate,
    )
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      staleTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    const invalidation = router.invalidate()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      isFetching: 'loader',
      loaderData: { generation: 1 },
    })

    reloadGate.resolve({ generation: 2 })
    await invalidation
    await vi.waitFor(() =>
      expect(router.state.matches.at(-1)).toMatchObject({
        status: 'success',
        isFetching: false,
        loaderData: { generation: 2 },
      }),
    )
  })

  test('a background loader can fulfill after aborting its controller', async () => {
    let loaderCalls = 0
    const loader = vi.fn(({ abortController }) => {
      loaderCalls++
      if (loaderCalls === 1) {
        return { generation: 1 }
      }
      abortController.abort()
      return { generation: 2 }
    })
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      staleTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    await router.invalidate()

    expect(loader).toHaveBeenCalledTimes(2)
    await vi.waitFor(() =>
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: pageRoute.id,
        status: 'success',
        isFetching: false,
        loaderData: { generation: 2 },
      }),
    )
    expect(router.state.status).toBe('idle')
  })

  test('a current loader can fulfill after aborting its controller', async () => {
    const loader = vi.fn(({ abortController }) => {
      abortController.abort()
      return 'accepted data'
    })
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      staleTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    await router.load()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.status).toBe('idle')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      loaderData: 'accepted data',
    })
  })

  test('background redirects use the navigation redirect limit', async () => {
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls++
      if (loaderCalls === 1) {
        return 'initial data'
      }
      if (loaderCalls < 30) {
        throw redirect({ to: '/page' })
      }
      return 'redirect limit was bypassed'
    })
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      shouldReload: true,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    await router.invalidate()

    expect(loader).toHaveBeenCalledTimes(22)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'error',
      error: expect.objectContaining({ message: 'Redirect cycle detected' }),
    })
  })

  test('a blocking child observes the fresh semantic parent generation', async () => {
    const parentReload = createControlledPromise<{ revision: number }>()
    let parentCalls = 0
    const parentLoader = vi.fn(() =>
      ++parentCalls === 1 ? { revision: 1 } : parentReload,
    )
    const childLoader = vi.fn(async ({ parentMatchPromise }) => {
      const parent = await parentMatchPromise
      return {
        parentRevision: (parent.loaderData as { revision: number }).revision,
      }
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      staleTime: Infinity,
      shouldReload: true,
      loader: parentLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: {
        staleReloadMode: 'blocking',
        handler: childLoader,
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent'] }),
    })

    await router.load()

    let settled = false
    const navigation = router.navigate({ to: '/parent/child' }).then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))

    expect(parentReload.status).toBe('pending')
    expect(settled).toBe(false)

    parentReload.resolve({ revision: 2 })
    await navigation

    await vi.waitFor(() =>
      expect(
        router.state.matches.find((match) => match.routeId === parentRoute.id),
      ).toMatchObject({ loaderData: { revision: 2 } }),
    )
    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id),
    ).toMatchObject({ loaderData: { parentRevision: 2 } })
  })

  test('a background descendant redirect wins after a blocking ancestor loader fails', async () => {
    const childStarted = createControlledPromise<void>()
    const childRedirect = createControlledPromise<void>()
    const parentError = new Error('parent failed')
    let parentLoads = 0
    let childLoads = 0

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: {
        staleReloadMode: 'blocking',
        handler: async () => {
          if (++parentLoads === 1) {
            return 'parent data'
          }
          await childStarted
          throw parentError
        },
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async () => {
        if (++childLoads === 1) {
          return 'child data'
        }
        childStarted.resolve()
        await childRedirect
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()
    const invalidation = router.invalidate()
    await childStarted
    childRedirect.resolve()
    await invalidation

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
    expect(
      router.state.matches.some((match) => match.error === parentError),
    ).toBe(false)
  })

  test('a hidden background descendant failure cannot replace an ancestor failure', async () => {
    const childStarted = createControlledPromise<void>()
    const parentError = new Error('parent failed')
    const childError = new Error('child failed')
    let parentLoads = 0
    let childLoads = 0

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: {
        staleReloadMode: 'blocking',
        handler: async () => {
          if (++parentLoads === 1) {
            return 'parent data'
          }
          await childStarted
          throw parentError
        },
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => {
        if (++childLoads === 1) {
          return 'child data'
        }
        childStarted.resolve()
        throw childError
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()
    await router.invalidate()

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
      childRoute.id,
    ])
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({ status: 'error', error: parentError })
    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id),
    ).toMatchObject({
      status: 'success',
      error: undefined,
      isFetching: false,
      loaderData: 'child data',
    })
    expect(
      router.state.matches.some((match) => match.error === childError),
    ).toBe(false)
  })

  test('background projection stays private until its lane wins publication', async () => {
    const reloadGate = createControlledPromise<{ title: string }>()
    const headGate = createControlledPromise<void>()
    const freshHeadStarted = createControlledPromise<void>()
    let loaderCalls = 0
    let allowReload = true
    const loader = vi.fn(() =>
      ++loaderCalls === 1 ? { title: 'old' } : reloadGate,
    )
    const head = vi.fn(async ({ loaderData }) => {
      if (loaderData?.title === 'fresh') {
        freshHeadStarted.resolve()
        await headGate
      }
      return { meta: [{ title: loaderData?.title }] }
    })

    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      staleTime: Infinity,
      shouldReload: () => allowReload,
      loader,
      head,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    allowReload = false
    await router.load()
    expect(router.state.matches.at(-1)).toMatchObject({
      loaderData: { title: 'old' },
      meta: [{ title: 'old' }],
    })

    allowReload = true
    const invalidation = router.invalidate()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    reloadGate.resolve({ title: 'fresh' })
    await freshHeadStarted

    expect(router.state.matches.at(-1)).toMatchObject({
      loaderData: { title: 'old' },
      meta: [{ title: 'old' }],
    })

    await router.navigate({ to: '/other' })
    allowReload = false
    headGate.resolve()
    await invalidation
    await Promise.resolve()

    await router.navigate({ to: '/page' })
    expect(router.state.matches.at(-1)).toMatchObject({
      loaderData: { title: 'old' },
      meta: [{ title: 'old' }],
      isFetching: false,
    })
  })

  test('redirect depth bookkeeping is cleared after a redirect chain settles', async () => {
    const hopBeforeLoad = vi.fn(({ params }) => {
      const hop = Number(params.hop)
      if (hop < 20) {
        throw redirect({
          to: '/hop/$hop',
          params: { hop: String(hop + 1) },
        } as any)
      }
    })
    const rootRoute = new BaseRootRoute({})
    const hopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hop/$hop',
      beforeLoad: hopBeforeLoad,
    })
    const againRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/again',
      beforeLoad: () => {
        throw redirect({ to: '/final' })
      },
    })
    const finalRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/final',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([hopRoute, againRoute, finalRoute]),
      history: createMemoryHistory({ initialEntries: ['/hop/0'] }),
    })

    await router.load()
    expect(router.state.location.pathname).toBe('/hop/20')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: hopRoute.id,
      status: 'success',
    })

    await router.navigate({ to: '/again' })
    expect(router.state.location.pathname).toBe('/final')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: finalRoute.id,
      status: 'success',
    })
    expect(router.state.status).toBe('idle')
  })

  test('a redirect is not blocked by an abort-ignoring sibling loader', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => new Promise(() => {}),
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => {
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.navigate({ to: '/source/child' })

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
  })
})
