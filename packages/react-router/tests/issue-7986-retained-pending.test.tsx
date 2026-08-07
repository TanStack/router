import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const navigationDelay = 100

function delayNavigation() {
  return new Promise<void>((resolve) => setTimeout(resolve, navigationDelay))
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

function setup() {
  const navigationBeforeLoadStarted = deferred()
  let beforeLoadCalls = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'app',
    beforeLoad: async () => {
      if (++beforeLoadCalls > 1) {
        navigationBeforeLoadStarted.resolve()
        await delayNavigation()
      }
      return { user: 'test' }
    },
    component: Outlet,
  })
  const projectRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/projects/$projectId',
    validateSearch: (search: Record<string, unknown>): { tab?: string } =>
      typeof search.tab === 'string' ? { tab: search.tab } : {},
    component: Project,
  })

  function Project() {
    const { projectId } = projectRoute.useParams()
    const { tab } = projectRoute.useSearch()
    return (
      <div data-testid="content">
        project={projectId} tab={tab ?? 'default'}
      </div>
    )
  }

  const router = createRouter({
    routeTree: rootRoute.addChildren([layoutRoute.addChildren([projectRoute])]),
    history: createMemoryHistory({ initialEntries: ['/projects/p1'] }),
    defaultPendingComponent: () => <div data-testid="pending">Pending</div>,
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  return {
    router,
    navigationBeforeLoadStarted,
  }
}

test('a search-only navigation retains successful UI while beforeLoad reruns', async () => {
  const { router, navigationBeforeLoadStarted } = setup()
  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({
      to: '/projects/$projectId',
      params: { projectId: 'p1' },
      search: { tab: 'files' },
    })
    await navigationBeforeLoadStarted.promise
  })

  const contentWhileLoading = screen.getByTestId('content')
  expect(contentWhileLoading).toBeVisible()
  expect(contentWhileLoading).toHaveTextContent('project=p1 tab=default')
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(navigationDelay)
    await navigation
  })

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=files',
  )
})

test('a path-param navigation retains successful UI while beforeLoad reruns', async () => {
  const { router, navigationBeforeLoadStarted } = setup()
  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({
      to: '/projects/$projectId',
      params: { projectId: 'p2' },
    })
    await navigationBeforeLoadStarted.promise
  })

  const contentWhileLoading = screen.getByTestId('content')
  expect(contentWhileLoading).toBeVisible()
  expect(contentWhileLoading).toHaveTextContent('project=p1 tab=default')
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(navigationDelay)
    await navigation
  })

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p2 tab=default',
  )
})

test('a blocking reload retains the exact successful match', async () => {
  const reloadStarted = deferred()
  let loaderCalls = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    validateSearch: (search: Record<string, unknown>): { tab?: string } =>
      typeof search.tab === 'string' ? { tab: search.tab } : {},
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        if (++loaderCalls === 1) {
          return 'initial'
        }
        reloadStarted.resolve()
        return delayNavigation().then(() => 'reloaded')
      },
    },
    component: () => (
      <div data-testid="content">
        {pageRoute.useLoaderData()} tab=
        {pageRoute.useSearch().tab ?? 'default'}
      </div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingComponent: () => <div data-testid="pending">Pending</div>,
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'initial tab=default',
  )

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({
      to: '/page',
      search: { tab: 'files' },
    })
    await reloadStarted.promise
  })

  const contentWhileLoading = screen.getByTestId('content')
  expect(contentWhileLoading).toBeVisible()
  expect(contentWhileLoading).toHaveTextContent('initial tab=default')
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('initial tab=default')
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(navigationDelay)
    await navigation
  })

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent('reloaded tab=files')
})

test('a cached success retries through pending UI when an error is mounted', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const retryStarted = deferred()
  const retry = deferred()
  let loaderCalls = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        loaderCalls++
        if (loaderCalls === 1) {
          throw new Error('initial load failed')
        }
        if (loaderCalls === 2) {
          return 'preloaded'
        }
        retryStarted.resolve()
        return retry.promise.then(() => 'retried')
      },
    },
    component: () => (
      <div data-testid="content">{pageRoute.useLoaderData()}</div>
    ),
    pendingComponent: () => <div data-testid="pending">Pending</div>,
    errorComponent: () => <div data-testid="error">Failed</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('error')).toBeInTheDocument()

  await router.preloadRoute({ to: '/page' })
  expect(loaderCalls).toBe(2)
  expect(screen.getByTestId('error')).toBeInTheDocument()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/page' })
    await retryStarted.promise
  })

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.getByTestId('error')).not.toBeVisible()

  await act(async () => {
    retry.resolve()
    await navigation
  })

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('retried')
})

test('a cache-only success retries through pending UI over mounted success', async () => {
  const retryStarted = deferred()
  const retry = deferred()
  let loaderCalls = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        const generation = ++loaderCalls
        if (generation === 3) {
          retryStarted.resolve()
          return retry.promise.then(() => `generation ${generation}`)
        }
        return `generation ${generation}`
      },
    },
    component: () => (
      <div data-testid="content">{pageRoute.useLoaderData()}</div>
    ),
    pendingComponent: () => <div data-testid="pending">Pending</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent('generation 1')

  await router.preloadRoute({ to: '/page' })
  expect(loaderCalls).toBe(2)
  expect(screen.getByTestId('content')).toHaveTextContent('generation 1')

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/page' })
    await retryStarted.promise
  })

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.getByTestId('content')).not.toBeVisible()

  await act(async () => {
    retry.resolve()
    await navigation
  })

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent('generation 3')
})

test('a success hidden below an error boundary retries through pending UI', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const childReloadStarted = deferred()
  const childReload = deferred()
  let parentFails = false
  let childReloads = false

  const rootRoute = createRootRoute({ component: Outlet })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    shouldReload: true,
    loader: () => {
      if (parentFails) {
        throw new Error('parent failed')
      }
      return 'parent data'
    },
    component: Outlet,
    errorComponent: () => <div data-testid="error">Parent failed</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    shouldReload: () => childReloads,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        if (childReloads) {
          childReloadStarted.resolve()
          return childReload.promise.then(() => 'reloaded child')
        }
        return 'initial child'
      },
    },
    component: () => (
      <div data-testid="content">{childRoute.useLoaderData()}</div>
    ),
    pendingComponent: () => <div data-testid="pending">Pending child</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'initial child',
  )

  parentFails = true
  await act(() => router.navigate({ to: '/parent/child' }))
  expect(await screen.findByTestId('error')).toBeInTheDocument()

  parentFails = false
  childReloads = true
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/parent/child' })
    await childReloadStarted.promise
  })

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('error')).not.toBeInTheDocument()

  await act(async () => {
    childReload.resolve()
    await navigation
  })

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('reloaded child')
})

test('a global not-found destination does not retain the mounted root success', async () => {
  const missingStarted = deferred()
  const missingLoader = deferred()
  let loaderCalls = 0

  const rootRoute = createRootRoute({
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        if (++loaderCalls === 1) {
          return 'initial root'
        }
        missingStarted.resolve()
        return missingLoader.promise
      },
    },
    component: Outlet,
    pendingComponent: () => <div data-testid="pending">Pending root</div>,
    notFoundComponent: () => <div data-testid="missing">Missing</div>,
  })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: () => <div data-testid="content">Page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toBeInTheDocument()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/missing' } as any)
    await missingStarted.promise
  })

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.getByTestId('content')).not.toBeVisible()

  await act(async () => {
    missingLoader.resolve()
    await navigation
  })

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('missing')).toBeVisible()
})

test('lazy fuzzy-boundary relocation retains the mounted parent', async () => {
  const lazyStarted = deferred()
  const lazyRoute = deferred()
  const parentReloadStarted = deferred()
  const parentReload = deferred()
  let parentLoads = 0

  const rootRoute = createRootRoute({
    component: Outlet,
    notFoundComponent: () => <div data-testid="root-missing">Root missing</div>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: async () => {
      if (++parentLoads > 1) {
        parentReloadStarted.resolve()
        await parentReload.promise
      }
    },
    component: () => (
      <div>
        <div data-testid="parent-content">Parent content</div>
        <Outlet />
      </div>
    ),
    pendingComponent: () => (
      <div data-testid="parent-pending">Parent pending</div>
    ),
    notFoundComponent: () => (
      <div data-testid="parent-missing">Parent missing</div>
    ),
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
  }).lazy(async () => {
    lazyStarted.resolve()
    await lazyRoute.promise
    return createLazyRoute('/parent/child')({
      notFoundComponent: () => (
        <div data-testid="child-missing">Child missing</div>
      ),
    })
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent'] }),
    defaultPendingComponent: () => (
      <div data-testid="default-pending">Pending</div>
    ),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('parent-content')).toBeVisible()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/parent/child/missing' as any })
    await lazyStarted.promise
  })

  expect(screen.getByTestId('parent-content')).toBeVisible()
  expect(screen.queryByTestId('parent-pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('parent-missing')).not.toBeInTheDocument()

  await act(async () => {
    lazyRoute.resolve()
    await parentReloadStarted.promise
  })

  expect(screen.getByTestId('parent-content')).toBeVisible()
  expect(screen.queryByTestId('parent-pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('parent-missing')).not.toBeInTheDocument()

  await act(async () => {
    parentReload.resolve()
    await navigation
  })

  expect(screen.getByTestId('child-missing')).toBeVisible()
  expect(screen.queryByTestId('root-missing')).not.toBeInTheDocument()
  expect(screen.queryByTestId('parent-missing')).not.toBeInTheDocument()
})

test('a superseding navigation replaces an unrelated pending presentation', async () => {
  const otherStarted = deferred()
  const otherLoader = deferred()
  const pageReloadStarted = deferred()
  const pageReload = deferred()
  let pageLoads = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        if (++pageLoads === 1) {
          return 'initial page'
        }
        pageReloadStarted.resolve()
        return pageReload.promise.then(() => 'reloaded page')
      },
    },
    component: () => (
      <div data-testid="content">{pageRoute.useLoaderData()}</div>
    ),
    pendingComponent: () => <div data-testid="page-pending">Page pending</div>,
  })
  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    loader: async () => {
      otherStarted.resolve()
      await otherLoader.promise
    },
    pendingComponent: () => (
      <div data-testid="other-pending">Other pending</div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent('initial page')

  await act(async () => {
    void router.navigate({ to: '/other' })
    await otherStarted.promise
  })
  expect(await screen.findByTestId('other-pending')).toBeVisible()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/page' })
    await pageReloadStarted.promise
  })

  await waitFor(() => {
    expect(screen.getByTestId('page-pending')).toBeVisible()
    expect(screen.queryByTestId('other-pending')).not.toBeInTheDocument()
  })

  await act(async () => {
    pageReload.resolve()
    await navigation
  })
  await act(async () => {
    otherLoader.resolve()
    await Promise.resolve()
  })

  expect(screen.queryByTestId('page-pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('reloaded page')
})
