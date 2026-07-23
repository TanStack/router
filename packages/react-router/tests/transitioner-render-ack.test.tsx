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
  const sourceMatchId = router.state.matches.at(-1)!.id

  const eventLog: Array<string> = []
  const unsubscribers = [
    router.subscribe('onResolved', (event) => {
      eventLog.push(`onResolved:${event.toLocation.pathname}`)
    }),
    router.subscribe('onRendered', (event) => {
      eventLog.push(`onRendered:${event.toLocation.pathname}`)
    }),
  ]
  testCleanups.push(...unsubscribers)

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
  expect(eventLog.filter((event) => event.endsWith('/items/target'))).toEqual([
    'onResolved:/items/target',
    'onRendered:/items/target',
  ])
  expect(router.state.resolvedLocation?.pathname).toBe('/items/target')
  const eventCountAfterForegroundCommit = eventLog.length

  await act(async () => {
    backgroundRefresh.resolve('obsolete source data')
    await Promise.resolve()
  })
  await waitFor(() => {
    expect(router._flights?.has(sourceMatchId) ?? false).toBe(false)
    const cachedSourceMatch = router._cache.get(sourceMatchId)
    expect(cachedSourceMatch?.loaderData).toBe('initial source data')
    expect(cachedSourceMatch?.isFetching).toBe(false)
  })

  expect(
    screen.getByText('Item target: foreground target data'),
  ).toBeInTheDocument()
  expect(
    screen.queryByText('Item source: obsolete source data'),
  ).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/items/target')
  expect(router.state.resolvedLocation?.pathname).toBe('/items/target')
  expect(router.state.matches.at(-1)?.routeId).toBe(itemRoute.id)
  expect(router.state.matches.at(-1)?.params).toEqual({ itemId: 'target' })
  expect(router.state.matches.at(-1)?.loaderData).toBe('foreground target data')
  expect(router.state.status).toBe('idle')
  expect(
    eventLog
      .slice(eventCountAfterForegroundCommit)
      .every((event) => event.endsWith('/items/target')),
  ).toBe(true)
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
