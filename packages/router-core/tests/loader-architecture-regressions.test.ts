import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

test('a child can redirect after observing its parent loader error', async () => {
  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: () => {
      throw new Error('parent failed')
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: async ({ parentMatchPromise }) => {
      const parent = await parentMatchPromise
      if (parent.status === 'error') {
        throw redirect({ to: '/target' })
      }
      return parent.status
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
    history: createMemoryHistory({
      initialEntries: ['/parent/child'],
    }),
  })

  await router.load()

  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: targetRoute.id,
    status: 'success',
  })
})

test('a descendant self-abort cannot hide redirecting onError on the client', async () => {
  const parentGate = createControlledPromise<void>()
  const childGate = createControlledPromise<void>()
  const parentOnError = vi.fn()
  const childOnError = vi.fn(() => {
    throw redirect({ to: '/target' })
  })
  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: async () => {
      await parentGate
      throw new Error('parent failed')
    },
    onError: parentOnError,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: async ({ abortController }) => {
      await childGate
      abortController.abort()
      throw new Error('child failed')
    },
    onError: childOnError,
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
    isServer: false,
  })

  const loading = router.load()
  parentGate.resolve()
  await vi.waitFor(() => expect(parentOnError).toHaveBeenCalledOnce())
  childGate.resolve()
  await vi.waitFor(() => expect(childOnError).toHaveBeenCalledOnce())

  await loading
  expect(router.state.location.pathname).toBe('/target')
})

test('invalidation reruns the loader with same-id route context', async () => {
  let contextGeneration = 0
  let loaderGeneration = 0
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: () => ({ generation: ++contextGeneration }),
    loader: ({ context }) => ({
      loader: ++loaderGeneration,
      context: context.generation,
    }),
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  expect(router.state.matches.at(-1)?.loaderData).toEqual({
    loader: 1,
    context: 1,
  })

  await router.invalidate()

  expect(router.state.matches.at(-1)?.loaderData).toEqual({
    loader: 2,
    context: 1,
  })
})

test('a joined descendant loader redirect still wins after an ancestor loader fails', async () => {
  const childStarted = createControlledPromise<void>()
  const childRedirect = createControlledPromise<void>()
  const ancestorFailure = new Error('navigation parent failed')
  let childLoads = 0

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    validateSearch: (search: Record<string, unknown>) => ({
      mode: String(search.mode ?? ''),
    }),
    loaderDeps: ({ search }) => ({ mode: search.mode }),
    loader: ({ location }) => {
      if ((location.search as { mode: string }).mode === 'navigation') {
        throw ancestorFailure
      }
      return 'preload parent data'
    },
    errorComponent: () => null,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: async () => {
      childLoads++
      if (childLoads === 1) {
        childStarted.resolve()
        await childRedirect
        throw redirect({ to: '/target' })
      }
      return 'retried child data'
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
  const preload = router.preloadRoute({
    to: '/parent/child',
    search: { mode: 'preload' },
  })
  await childStarted

  const navigation = router.navigate({
    to: '/parent/child',
    search: { mode: 'navigation' },
  })
  childRedirect.resolve()
  await Promise.all([preload, navigation])

  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: targetRoute.id,
    status: 'success',
  })
  expect(childLoads).toBe(1)
})

test('a reentrant user navigation starts a fresh redirect chain', async () => {
  let navigateFresh: () => void
  const rootRoute = new BaseRootRoute({})
  const chain = Array.from(
    { length: 20 },
    (_, index) =>
      new BaseRoute({
        getParentRoute: () => rootRoute,
        path: `/chain-${index}`,
        beforeLoad:
          index < 19
            ? () => {
                throw redirect({ to: `/chain-${index + 1}` })
              }
            : () => navigateFresh(),
      }),
  )
  const freshRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/fresh',
    beforeLoad: () => {
      throw redirect({ to: '/target' })
    },
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      ...(chain as any),
      freshRoute,
      targetRoute,
    ]) as any,
    history: createMemoryHistory({ initialEntries: ['/chain-0'] }),
  })
  navigateFresh = () => {
    void router.navigate({ to: '/fresh' })
  }

  await router.load()

  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: targetRoute.id,
    status: 'success',
  })
})
