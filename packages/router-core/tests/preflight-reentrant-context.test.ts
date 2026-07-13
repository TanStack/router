import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('synchronous navigation from route context stops abandoned descendant context work', async () => {
  let redirected = false
  let redirectNavigation: Promise<void> | undefined
  const childContext = vi.fn(() => ({ child: true }))

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    context: ({ navigate }) => {
      if (!redirected) {
        redirected = true
        redirectNavigation = navigate({ to: '/target' })
      }
      return { parent: true }
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    context: childContext,
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
  await router.navigate({ to: '/parent/child' })
  await redirectNavigation

  expect(router.state.location.pathname).toBe('/target')
  expect(childContext).not.toHaveBeenCalled()
})

test('synchronous navigation from preloaded route context stops abandoned descendant context work', async () => {
  let redirected = false
  let redirectNavigation: Promise<void> | undefined
  const childContext = vi.fn(() => ({ child: true }))

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    context: ({ navigate, preload }) => {
      if (preload && !redirected) {
        redirected = true
        redirectNavigation = navigate({ to: '/target' })
      }
      return { parent: true }
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    context: childContext,
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
  await router.preloadRoute({ to: '/parent/child' })
  await redirectNavigation

  expect(router.state.location.pathname).toBe('/target')
  expect(childContext).not.toHaveBeenCalled()
})

test('navigation from loaderDeps toJSON stops later abandoned callbacks', async () => {
  let router!: ReturnType<typeof createTestRouter>
  let redirected = false
  let redirectNavigation: Promise<void> | undefined
  const childContext = vi.fn(() => ({ child: true }))

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loaderDeps: () => ({
      toJSON: () => {
        if (!redirected) {
          redirected = true
          redirectNavigation = router.navigate({ to: '/target' })
        }
        return { key: 'parent' }
      },
    }),
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    context: childContext,
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
      targetRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/parent/child' })
  await redirectNavigation

  expect(router.state.location.pathname).toBe('/target')
  expect(childContext).not.toHaveBeenCalled()
})
