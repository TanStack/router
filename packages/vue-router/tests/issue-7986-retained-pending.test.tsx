import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import { nextTick } from 'vue'
import {
  Outlet,
  RouterProvider,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { ControlledPromise } from '@tanstack/router-core'

const controlledPromises = new Set<ControlledPromise<void>>()
const pendingOperations = new Set<Promise<unknown>>()

afterEach(async () => {
  try {
    for (const promise of controlledPromises) {
      if (promise.status === 'pending') {
        promise.resolve()
      }
    }
    if (vi.isFakeTimers()) {
      await vi.runAllTimersAsync()
    }
    await Promise.allSettled(pendingOperations)
  } finally {
    controlledPromises.clear()
    pendingOperations.clear()
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  }
})

const navigationDelay = 100

function controlled() {
  const promise = createControlledPromise<void>()
  controlledPromises.add(promise)
  return promise
}

function track<T>(operation: Promise<T>) {
  pendingOperations.add(operation)
  return operation
}

function setup() {
  const navigationBeforeLoadStarted = controlled()
  let beforeLoadCalls = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'app',
    beforeLoad: async () => {
      if (++beforeLoadCalls > 1) {
        navigationBeforeLoadStarted.resolve()
        await new Promise<void>((resolve) =>
          setTimeout(resolve, navigationDelay),
        )
      }
      return { user: 'test' }
    },
    component: () => <Outlet />,
  })
  const projectRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/projects/$projectId',
    validateSearch: (search: Record<string, unknown>): { tab?: string } =>
      typeof search.tab === 'string' ? { tab: search.tab } : {},
    component: Project,
  })

  function Project() {
    const params = projectRoute.useParams()
    const search = projectRoute.useSearch()
    return (
      <div data-testid="content">
        project={params.value.projectId} tab={search.value.tab ?? 'default'}
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

  return { router, navigationBeforeLoadStarted }
}

test('a search-only navigation retains successful UI while beforeLoad reruns', async () => {
  const { router, navigationBeforeLoadStarted } = setup()
  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const navigation = track(
    router.navigate({
      to: '/projects/$projectId',
      params: { projectId: 'p1' },
      search: { tab: 'files' },
    }),
  )
  await navigationBeforeLoadStarted

  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(navigationDelay)
  await navigation
  await nextTick()

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
  const navigation = track(
    router.navigate({
      to: '/projects/$projectId',
      params: { projectId: 'p2' },
    }),
  )
  await navigationBeforeLoadStarted

  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(navigationDelay)
  await navigation
  await nextTick()

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p2 tab=default',
  )
})

test('a blocking reload retains the exact successful match', async () => {
  const reloadStarted = controlled()
  let loaderCalls = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
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
        return new Promise<string>((resolve) =>
          setTimeout(() => resolve('reloaded'), navigationDelay),
        )
      },
    },
    component: () => {
      const loaderData = pageRoute.useLoaderData()
      const search = pageRoute.useSearch()
      return (
        <div data-testid="content">
          {loaderData.value} tab={search.value.tab ?? 'default'}
        </div>
      )
    },
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
  const navigation = track(
    router.navigate({
      to: '/page',
      search: { tab: 'files' },
    }),
  )
  await reloadStarted

  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('initial tab=default')
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('initial tab=default')
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(navigationDelay)
  await navigation
  await nextTick()

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent('reloaded tab=files')
})

test('a cached success retries through pending UI when an error is mounted', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const retryStarted = controlled()
  const retry = controlled()
  let loaderCalls = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
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
        return retry.then(() => 'retried')
      },
    },
    component: () => {
      const loaderData = pageRoute.useLoaderData()
      return <div data-testid="content">{loaderData.value}</div>
    },
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

  const navigation = track(router.navigate({ to: '/page' }))
  await retryStarted
  await nextTick()

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('error')).not.toBeInTheDocument()

  retry.resolve()
  await navigation
  await nextTick()

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('retried')
})

test('a cache-only success retries through pending UI over mounted success', async () => {
  const retryStarted = controlled()
  const retry = controlled()
  let loaderCalls = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
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
          return retry.then(() => `generation ${generation}`)
        }
        return `generation ${generation}`
      },
    },
    component: () => {
      const loaderData = pageRoute.useLoaderData()
      return <div data-testid="content">{loaderData.value}</div>
    },
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

  const navigation = track(router.navigate({ to: '/page' }))
  await retryStarted
  await nextTick()

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('content')).not.toBeInTheDocument()

  retry.resolve()
  await navigation
  await nextTick()

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent('generation 3')
})

test('a success hidden below an error boundary retries through pending UI', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const childReloadStarted = controlled()
  const childReload = controlled()
  let parentFails = false
  let childReloads = false

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
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
    component: () => <Outlet />,
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
          return childReload.then(() => 'reloaded child')
        }
        return 'initial child'
      },
    },
    component: () => {
      const loaderData = childRoute.useLoaderData()
      return <div data-testid="content">{loaderData.value}</div>
    },
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
  await track(router.navigate({ to: '/parent/child' }))
  await nextTick()
  expect(await screen.findByTestId('error')).toBeInTheDocument()

  parentFails = false
  childReloads = true
  const navigation = track(router.navigate({ to: '/parent/child' }))
  await childReloadStarted
  await nextTick()

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('error')).not.toBeInTheDocument()

  childReload.resolve()
  await navigation
  await nextTick()

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('reloaded child')
})

test('a global not-found destination does not retain the mounted root success', async () => {
  const missingStarted = controlled()
  const missingLoader = controlled()
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
        return missingLoader
      },
    },
    component: () => <Outlet />,
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

  const navigation = track(router.navigate({ to: '/missing' } as any))
  await missingStarted
  await nextTick()

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('content')).not.toBeInTheDocument()

  missingLoader.resolve()
  await navigation
  await nextTick()

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('missing')).toBeVisible()
})

test('lazy fuzzy-boundary relocation retains the mounted parent', async () => {
  const lazyStarted = controlled()
  const lazyRoute = controlled()
  const parentReloadStarted = controlled()
  const parentReload = controlled()
  let parentLoads = 0

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    notFoundComponent: () => <div data-testid="root-missing">Root missing</div>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: async () => {
      if (++parentLoads > 1) {
        parentReloadStarted.resolve()
        await parentReload
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
    await lazyRoute
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

  const navigation = track(
    router.navigate({
      to: '/parent/child/missing' as any,
    }),
  )
  await lazyStarted
  await nextTick()

  expect(screen.getByTestId('parent-content')).toBeVisible()
  expect(screen.queryByTestId('parent-pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('parent-missing')).not.toBeInTheDocument()

  lazyRoute.resolve()
  await parentReloadStarted
  await nextTick()

  expect(screen.getByTestId('parent-content')).toBeVisible()
  expect(screen.queryByTestId('parent-pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('parent-missing')).not.toBeInTheDocument()

  parentReload.resolve()
  await navigation
  await nextTick()

  expect(screen.getByTestId('child-missing')).toBeVisible()
  expect(screen.queryByTestId('root-missing')).not.toBeInTheDocument()
  expect(screen.queryByTestId('parent-missing')).not.toBeInTheDocument()
})

test('a superseding navigation replaces an unrelated pending presentation', async () => {
  const otherStarted = controlled()
  const otherLoader = controlled()
  const pageReloadStarted = controlled()
  const pageReload = controlled()
  let pageLoads = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
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
        return pageReload.then(() => 'reloaded page')
      },
    },
    component: () => {
      const loaderData = pageRoute.useLoaderData()
      return <div data-testid="content">{loaderData.value}</div>
    },
    pendingComponent: () => <div data-testid="page-pending">Page pending</div>,
  })
  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    loader: async () => {
      otherStarted.resolve()
      await otherLoader
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

  const otherNavigation = track(router.navigate({ to: '/other' }))
  await otherStarted
  await nextTick()
  expect(await screen.findByTestId('other-pending')).toBeVisible()

  const navigation = track(router.navigate({ to: '/page' }))
  await pageReloadStarted
  await nextTick()

  await waitFor(() => {
    expect(screen.getByTestId('page-pending')).toBeVisible()
    expect(screen.queryByTestId('other-pending')).not.toBeInTheDocument()
  })

  pageReload.resolve()
  await navigation
  otherLoader.resolve()
  await Promise.allSettled([otherNavigation])
  await nextTick()

  expect(screen.queryByTestId('page-pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('reloaded page')
})

test('a retained root publishes fresh context with a child fallback', async () => {
  const retainedStarted = controlled()
  const retainedReady = controlled()
  const childStarted = controlled()
  const childReady = controlled()
  let retainedLoads = 0

  const rootRoute = createRootRoute({
    validateSearch: (search: Record<string, unknown>): { user: string } => ({
      user: typeof search.user === 'string' ? search.user : 'unknown',
    }),
    beforeLoad: async ({ search }) => {
      if (++retainedLoads > 1) {
        retainedStarted.resolve()
        await retainedReady
      }
      return { user: search.user }
    },
    component: () => {
      const context = rootRoute.useRouteContext()
      return (
        <div>
          <div data-testid="user">{context.value.user}</div>
          <Outlet />
        </div>
      )
    },
  })
  const sourceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/source',
    component: () => <div data-testid="source">Source</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    loader: async () => {
      childStarted.resolve()
      await childReady
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <div data-testid="child-pending">Pending</div>,
    component: () => <div data-testid="child">Child</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([sourceRoute, childRoute]),
    history: createMemoryHistory({ initialEntries: ['/source?user=Ada'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('source')).toBeVisible()
  expect(screen.getByTestId('user')).toHaveTextContent('Ada')
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const navigation = track(
    router.navigate({ to: '/child', search: { user: 'Grace' } }),
  )
  await retainedStarted
  await nextTick()
  expect(screen.getByTestId('source')).toBeVisible()
  expect(screen.getByTestId('user')).toHaveTextContent('Ada')
  expect(screen.queryByTestId('child-pending')).not.toBeInTheDocument()

  retainedReady.resolve()
  await childStarted
  await nextTick()
  expect(await screen.findByTestId('child-pending')).toBeVisible()
  expect(screen.getByTestId('user')).toHaveTextContent('Grace')

  childReady.resolve()
  await navigation
  await nextTick()
  expect(screen.getByTestId('child')).toBeVisible()
})
