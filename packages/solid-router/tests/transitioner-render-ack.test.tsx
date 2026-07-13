import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('onRendered observes the committed destination DOM', async () => {
  const nextLoader = createControlledPromise<void>()
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: () => <div>First</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    loader: () => nextLoader,
    component: () => <div>Next</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([firstRoute, nextRoute]),
    history: createMemoryHistory({ initialEntries: ['/first'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('First')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const renderedDom: Array<{ destination: boolean; outgoing: boolean }> = []
  const unsubscribe = router.subscribe('onRendered', () => {
    renderedDom.push({
      destination: screen.queryByText('Next') !== null,
      outgoing: screen.queryByText('First') !== null,
    })
  })

  const navigation = router.navigate({ to: '/next' })

  expect(screen.queryByText('Next')).toBeNull()
  expect(renderedDom).toEqual([])

  nextLoader.resolve()
  await navigation
  await waitFor(() => expect(renderedDom).toHaveLength(1))

  expect(renderedDom).toEqual([{ destination: true, outgoing: false }])

  unsubscribe()
})

test('an older rendered destination cannot resolve a superseding navigation', async () => {
  const nextLoader = createControlledPromise<void>()
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: () => <div>First</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    loader: () => nextLoader,
    component: () => <div>Next</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, firstRoute, nextRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const renderedPaths: Array<string> = []
  const resolvedPaths: Array<string> = []
  let nextNavigation: Promise<void> | undefined
  const unsubscribers = [
    router.subscribe('onLoad', (event) => {
      if (event.toLocation.pathname === '/first') {
        nextNavigation = router.navigate({ to: '/next' })
      }
    }),
    router.subscribe('onRendered', (event) => {
      renderedPaths.push(event.toLocation.pathname)
    }),
    router.subscribe('onResolved', (event) => {
      resolvedPaths.push(event.toLocation.pathname)
    }),
  ]

  const firstNavigation = router.navigate({ to: '/first' })

  await waitFor(() => {
    expect(nextNavigation).toBeDefined()
  })
  expect(screen.getByText('First')).toBeInTheDocument()
  expect(screen.queryByText('Next')).not.toBeInTheDocument()
  expect(renderedPaths).toEqual(['/first'])
  expect(resolvedPaths).toEqual([])

  nextLoader.resolve()
  await Promise.all([firstNavigation, nextNavigation!])

  await waitFor(() => {
    expect(screen.getByText('Next')).toBeInTheDocument()
  })
  expect(renderedPaths).toEqual(['/first', '/next'])
  expect(resolvedPaths).toEqual(['/next'])

  for (const unsubscribe of unsubscribers) {
    unsubscribe()
  }
})

test('same-location invalidation resolves after its refreshed DOM commits', async () => {
  let generation = 0
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => ++generation,
    component: () => <div>Generation {indexRoute.useLoaderData()()}</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Generation 1')).toBeInTheDocument()

  const refreshedDomWasVisible: Array<boolean> = []
  const unsubscribe = router.subscribe('onResolved', () => {
    refreshedDomWasVisible.push(screen.queryByText('Generation 2') !== null)
  })

  await router.invalidate()
  expect(await screen.findByText('Generation 2')).toBeInTheDocument()
  expect(refreshedDomWasVisible).toEqual([true])

  unsubscribe()
})
