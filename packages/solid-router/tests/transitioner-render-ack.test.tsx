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
import type { HistoryState } from '../src'

afterEach(() => {
  cleanup()
})

test('onResolved precedes onRendered and both observe the committed destination DOM', async () => {
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

  const lifecycle: Array<{
    event: 'onResolved' | 'onRendered'
    pathname: string
    destination: boolean
    outgoing: boolean
  }> = []
  const unsubscribers = [
    router.subscribe('onResolved', (event) => {
      lifecycle.push({
        event: 'onResolved',
        pathname: event.toLocation.pathname,
        destination: screen.queryByText('Next') !== null,
        outgoing: screen.queryByText('First') !== null,
      })
    }),
    router.subscribe('onRendered', (event) => {
      lifecycle.push({
        event: 'onRendered',
        pathname: event.toLocation.pathname,
        destination: screen.queryByText('Next') !== null,
        outgoing: screen.queryByText('First') !== null,
      })
    }),
  ]

  try {
    const navigation = router.navigate({ to: '/next' })

    expect(screen.queryByText('Next')).toBeNull()
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(lifecycle).toEqual([])

    nextLoader.resolve()
    await navigation
    await waitFor(() =>
      expect(lifecycle).toEqual([
        {
          event: 'onResolved',
          pathname: '/next',
          destination: true,
          outgoing: false,
        },
        {
          event: 'onRendered',
          pathname: '/next',
          destination: true,
          outgoing: false,
        },
      ]),
    )
  } finally {
    nextLoader.resolve()
    for (const unsubscribe of unsubscribers) {
      unsubscribe()
    }
  }
})

test('onRendered describes each committed navigation from the previously rendered location', async () => {
  type SameHrefTestState = HistoryState & { sameHrefState: true }
  const isSameHrefTestState = (
    state: HistoryState | undefined,
  ): state is SameHrefTestState =>
    state !== undefined &&
    'sameHrefState' in state &&
    state.sameHrefState === true

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    component: () => <div>Next</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const renderedChanges: Array<{
    fromPathname: string | undefined
    toPathname: string
    fromHref: string | undefined
    toHref: string
    pathChanged: boolean
    hrefChanged: boolean
    fromSameHrefState: boolean
    toSameHrefState: boolean
    renderedRoute: 'Index' | 'Next' | undefined
  }> = []
  const unsubscribe = router.subscribe('onRendered', (event) => {
    renderedChanges.push({
      fromPathname: event.fromLocation?.pathname,
      toPathname: event.toLocation.pathname,
      fromHref: event.fromLocation?.href,
      toHref: event.toLocation.href,
      pathChanged: event.pathChanged,
      hrefChanged: event.hrefChanged,
      fromSameHrefState: isSameHrefTestState(event.fromLocation?.state),
      toSameHrefState: isSameHrefTestState(event.toLocation.state),
      renderedRoute: screen.queryByText('Next')
        ? 'Next'
        : screen.queryByText('Index')
          ? 'Index'
          : undefined,
    })
  })

  try {
    await router.navigate({ to: '/next' })
    expect(await screen.findByText('Next')).toBeInTheDocument()
    await waitFor(() =>
      expect(renderedChanges).toEqual([
        {
          fromPathname: '/',
          toPathname: '/next',
          fromHref: '/',
          toHref: '/next',
          pathChanged: true,
          hrefChanged: true,
          fromSameHrefState: false,
          toSameHrefState: false,
          renderedRoute: 'Next',
        },
      ]),
    )

    const sameHrefState: SameHrefTestState = { sameHrefState: true }
    await router.navigate({
      to: '/next',
      state: sameHrefState,
    })
    await waitFor(() =>
      expect(renderedChanges).toEqual([
        {
          fromPathname: '/',
          toPathname: '/next',
          fromHref: '/',
          toHref: '/next',
          pathChanged: true,
          hrefChanged: true,
          fromSameHrefState: false,
          toSameHrefState: false,
          renderedRoute: 'Next',
        },
        {
          fromPathname: '/next',
          toPathname: '/next',
          fromHref: '/next',
          toHref: '/next',
          pathChanged: false,
          hrefChanged: false,
          fromSameHrefState: false,
          toSameHrefState: true,
          renderedRoute: 'Next',
        },
      ]),
    )
  } finally {
    unsubscribe()
  }
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

  const lifecycle: Array<{
    event: 'onResolved' | 'onRendered'
    pathname: string
    destination: boolean
    superseded: boolean
  }> = []
  let nextNavigation: Promise<void> | undefined
  const unsubscribers = [
    router.subscribe('onLoad', (event) => {
      if (event.toLocation.pathname === '/first') {
        nextNavigation = router.navigate({ to: '/next' })
      }
    }),
    router.subscribe('onResolved', (event) => {
      lifecycle.push({
        event: 'onResolved',
        pathname: event.toLocation.pathname,
        destination: screen.queryByText('Next') !== null,
        superseded: screen.queryByText('First') !== null,
      })
    }),
    router.subscribe('onRendered', (event) => {
      lifecycle.push({
        event: 'onRendered',
        pathname: event.toLocation.pathname,
        destination: screen.queryByText('Next') !== null,
        superseded: screen.queryByText('First') !== null,
      })
    }),
  ]

  try {
    const firstNavigation = router.navigate({ to: '/first' })

    await waitFor(() => {
      expect(nextNavigation).toBeDefined()
    })
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
    expect(lifecycle).toEqual([])

    nextLoader.resolve()
    await Promise.all([firstNavigation, nextNavigation!])

    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument()
    })
    expect(lifecycle).toEqual([
      {
        event: 'onResolved',
        pathname: '/next',
        destination: true,
        superseded: false,
      },
      {
        event: 'onRendered',
        pathname: '/next',
        destination: true,
        superseded: false,
      },
    ])
  } finally {
    nextLoader.resolve()
    for (const unsubscribe of unsubscribers) {
      unsubscribe()
    }
  }
})

test('same-location invalidation resolves after its refreshed DOM commits', async () => {
  let generation = 0
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: {
      staleReloadMode: 'blocking',
      handler: () => ++generation,
    },
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

  try {
    await router.invalidate()
    expect(await screen.findByText('Generation 2')).toBeInTheDocument()
    expect(refreshedDomWasVisible).toEqual([true])
  } finally {
    unsubscribe()
  }
})
