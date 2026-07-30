import { StrictMode, act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const testCleanups: Array<() => void> = []

afterEach(() => {
  while (testCleanups.length) {
    testCleanups.pop()!()
  }
  cleanup()
  vi.useRealTimers()
})

test('same-location invalidation emits onResolved after its refreshed DOM commits', async () => {
  let generation = 0
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: {
      staleReloadMode: 'blocking',
      handler: () => ++generation,
    },
    component: () => <div>Generation {indexRoute.useLoaderData()}</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Generation 1')).toBeInTheDocument()
  await waitFor(() => {
    expect(router.state.status).toBe('idle')
    expect(router.state.resolvedLocation?.pathname).toBe('/')
  })

  const refreshedDomWasVisible: Array<boolean> = []
  const unsubscribe = router.subscribe('onResolved', () => {
    refreshedDomWasVisible.push(screen.queryByText('Generation 2') !== null)
  })
  testCleanups.push(unsubscribe)

  await act(() => router.invalidate())
  expect(screen.getByText('Generation 2')).toBeInTheDocument()
  expect(screen.queryByText('Generation 1')).not.toBeInTheDocument()
  expect(refreshedDomWasVisible).toEqual([true])
})

test('a navigation superseding a suspended render acknowledges only the latest route', async () => {
  const renderStarted = createControlledPromise<void>()
  const renderGate = createControlledPromise<void>()
  let signaled = false

  const rootRoute = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      revision: Number(search.revision),
    }),
    component: () => {
      const revision = rootRoute.useSearch().revision
      if (revision === 1 && renderGate.status === 'pending') {
        if (!signaled) {
          signaled = true
          renderStarted.resolve()
        }
        throw renderGate
      }
      return <div>Root revision {revision}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/?revision=0'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Root revision 0')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const renderedRevisions: Array<number> = []
  testCleanups.push(
    router.subscribe('onRendered', (event) => {
      renderedRevisions.push(
        Number((event.toLocation.search as Record<string, unknown>).revision),
      )
    }),
  )

  let suspendedNavigation!: Promise<void>
  await act(async () => {
    suspendedNavigation = router.navigate({
      to: '/',
      search: { revision: 1 },
    })
    await renderStarted
  })

  const suspendedSettled = vi.fn()
  void suspendedNavigation.then(suspendedSettled)
  expect(screen.getByText('Root revision 0')).toBeInTheDocument()
  expect(suspendedSettled).not.toHaveBeenCalled()
  expect(renderedRevisions).toEqual([])

  try {
    await act(() =>
      router.navigate({
        to: '/',
        search: { revision: 2 },
      }),
    )
    await suspendedNavigation

    expect(screen.getByText('Root revision 2')).toBeInTheDocument()
    expect(renderedRevisions).toEqual([2])
    expect(suspendedSettled).toHaveBeenCalledOnce()
  } finally {
    await act(async () => {
      renderGate.resolve()
      await Promise.resolve()
    })
  }

  expect(screen.getByText('Root revision 2')).toBeInTheDocument()
  expect(renderedRevisions).toEqual([2])
})

test('a late background refresh is discarded after foreground navigation commits', async () => {
  const backgroundRefresh = createControlledPromise<string>()
  let sourceGeneration = 0
  const itemLoader = vi.fn((itemId: string) => {
    if (itemId === 'source') {
      sourceGeneration++
      if (sourceGeneration === 1) {
        return 'initial source data'
      }
      return backgroundRefresh
    }
    return 'foreground target data'
  })
  const rootRoute = createRootRoute({ component: Outlet })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$itemId',
    staleTime: Infinity,
    loader: {
      staleReloadMode: 'background',
      handler: ({ params }) => itemLoader(params.itemId),
    },
    component: () => (
      <div>
        Item {itemRoute.useParams().itemId}: {itemRoute.useLoaderData()}
      </div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/items/source'] }),
  })

  render(<RouterProvider router={router} />)
  expect(
    await screen.findByText('Item source: initial source data'),
  ).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  await act(() => router.invalidate())
  expect(itemLoader).toHaveBeenCalledTimes(2)

  await act(() =>
    router.navigate({
      to: '/items/$itemId',
      params: { itemId: 'target' },
    }),
  )
  expect(
    screen.getByText('Item target: foreground target data'),
  ).toBeInTheDocument()

  await act(async () => {
    backgroundRefresh.resolve('obsolete source data')
    await Promise.resolve()
  })

  expect(
    screen.getByText('Item target: foreground target data'),
  ).toBeInTheDocument()
  expect(
    screen.queryByText('Item source: obsolete source data'),
  ).not.toBeInTheDocument()

  await act(() =>
    router.navigate({
      to: '/items/$itemId',
      params: { itemId: 'source' },
    }),
  )
  expect(
    screen.getByText('Item source: initial source data'),
  ).toBeInTheDocument()
  expect(screen.queryByText('Item source: obsolete source data')).toBeNull()
  expect(itemLoader).toHaveBeenCalledTimes(3)
})

test('a navigation started by route lifecycle keeps the pending minimum of its own render', async () => {
  const slowLoader = createControlledPromise<void>()
  let nestedNavigation: Promise<void> | undefined
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const redirectorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/redirector',
    onEnter: () => {
      nestedNavigation = router.navigate({ to: '/slow' })
    },
    component: () => <div>Redirector</div>,
  })
  const slowRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/slow',
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div>Slow pending</div>,
    loader: () => slowLoader,
    component: () => <div>Slow done</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, redirectorRoute, slowRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  vi.useFakeTimers()

  let firstNavigation!: Promise<void>
  await act(async () => {
    firstNavigation = router.navigate({ to: '/redirector' })
    await vi.advanceTimersByTimeAsync(0)
  })

  expect(nestedNavigation).toBeDefined()
  expect(screen.getByText('Slow pending')).toBeInTheDocument()

  await act(async () => {
    slowLoader.resolve()
    await Promise.resolve()
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(99)
  })
  expect(screen.getByText('Slow pending')).toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
    await Promise.all([firstNavigation, nestedNavigation!])
  })
  expect(screen.queryByText('Slow pending')).not.toBeInTheDocument()
  expect(screen.getByText('Slow done')).toBeInTheDocument()
})

test('StrictMode effect replay preserves renderer commit sequencing', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
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

  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
  expect(await screen.findByText('Index')).toBeInTheDocument()
  await waitFor(() => {
    expect(router.state.status).toBe('idle')
    expect(router.state.resolvedLocation?.pathname).toBe('/')
  })

  const eventLog: Array<string> = []
  const unsubscribers = [
    router.subscribe('onResolved', (event) => {
      if (event.toLocation.pathname === '/next') {
        eventLog.push('onResolved:/next')
      }
    }),
    router.subscribe('onRendered', (event) => {
      if (event.toLocation.pathname === '/next') {
        eventLog.push('onRendered:/next')
      }
    }),
  ]
  testCleanups.push(...unsubscribers)

  await act(() => router.navigate({ to: '/next' }))
  expect(eventLog).toEqual(['onResolved:/next', 'onRendered:/next'])
  expect(screen.getByText('Next')).toBeInTheDocument()
  expect(screen.queryByText('Index')).not.toBeInTheDocument()
})
