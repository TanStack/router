import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createControlledPromise,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { RouterHistory } from '../src'

afterEach(() => {
  vi.resetAllMocks()
  cleanup()
})

function createTestRouter(initialHistory?: RouterHistory) {
  const history =
    initialHistory ?? createMemoryHistory({ initialEntries: ['/'] })

  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <div>
        <p>Index Route</p>
        <Link to="/heavy">Link to heavy</Link>
      </div>
    ),
  })

  const heavyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/heavy',
  }).lazy(() => import('./lazy/heavy').then((d) => d.default('/heavy')))

  const routeTree = rootRoute.addChildren([indexRoute, heavyRoute])

  const router = createRouter({ routeTree, history })

  return {
    router,
    routes: { indexRoute, heavyRoute },
  }
}

describe('preload: matched routes', { timeout: 20000 }, () => {
  it('should wait for lazy options to be streamed in before ', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/'] }),
    )

    await router.load()

    // Preload the route and navigate to it
    router.preloadRoute({ to: '/heavy' })
    await router.navigate({ to: '/heavy' })

    await router.invalidate()

    expect(router.state.location.pathname).toBe('/heavy')

    const lazyRoute = router.routesByPath['/heavy']

    expect(lazyRoute.options.component).toBeDefined()
  })

  it('should render the heavy/lazy component', async () => {
    const { router } = createTestRouter(createBrowserHistory())

    render(() => <RouterProvider router={router} />)

    const linkToHeavy = await screen.findByText('Link to heavy')
    expect(linkToHeavy).toBeInTheDocument()

    expect(router.state.location.pathname).toBe('/')
    expect(window.location.pathname).toBe('/')

    // click the link to navigate to the heavy route
    fireEvent.click(linkToHeavy)

    const heavyElement = await screen.findByText('I am sooo heavy')

    expect(heavyElement).toBeInTheDocument()

    expect(router.state.location.pathname).toBe('/heavy')
    expect(window.location.pathname).toBe('/heavy')

    const lazyRoute = router.routesByPath['/heavy']
    expect(lazyRoute.options.component).toBeDefined()
  })
})

// https://github.com/TanStack/router/issues/4467
it('replaces default pending UI when delayed lazy options provide pending UI', async () => {
  const loader = createControlledPromise<void>()
  const componentPreload = createControlledPromise<void>()
  const preloadComponent = vi.fn(() => componentPreload)
  const Page = Object.assign(() => <h1>Page</h1>, {
    preload: preloadComponent,
  })
  const lazyPageOptions = createLazyRoute('/page')({
    pendingComponent: () => <p role="status">Loading lazy page</p>,
    component: Page,
  })
  const lazyOptions = createControlledPromise<typeof lazyPageOptions>()
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Index page</h1>,
  })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    loader: () => loader,
  }).lazy(() => lazyOptions)
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: () => <p role="status">Loading default</p>,
  })
  let navigation: Promise<void> | undefined

  try {
    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Index page')).toBeInTheDocument()

    navigation = router.navigate({ to: '/page' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Loading default',
    )

    lazyOptions.resolve(lazyPageOptions)
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Loading lazy page'),
    )
    expect(preloadComponent).toHaveBeenCalledOnce()
    expect(componentPreload.status).toBe('pending')
    expect(screen.queryByText('Page')).not.toBeInTheDocument()

    componentPreload.resolve()
    loader.resolve()
    await navigation

    expect(await screen.findByText('Page')).toBeInTheDocument()
  } finally {
    lazyOptions.resolve(lazyPageOptions)
    componentPreload.resolve()
    loader.resolve()
    if (navigation) {
      await Promise.allSettled([navigation])
    }
  }
})

it('renders an eager loader error with a delayed lazy errorComponent', async () => {
  const loader = createControlledPromise<void>()
  const loaderErrorHandled = createControlledPromise<void>()
  const loaderError = new Error('loader failed')
  const lazyPageOptions = createLazyRoute('/page')({
    component: () => <h1>Page</h1>,
    errorComponent: ({ error }) => (
      <p role="alert">Lazy error: {error.message}</p>
    ),
  })
  const lazyOptions = createControlledPromise<typeof lazyPageOptions>()
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Index page</h1>,
  })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    loader: async () => {
      await loader
      throw loaderError
    },
    onError: () => loaderErrorHandled.resolve(),
  }).lazy(() => lazyOptions)
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: () => <p role="status">Loading default</p>,
  })
  let navigation: Promise<void> | undefined

  try {
    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Index page')).toBeInTheDocument()

    navigation = router.navigate({ to: '/page' })
    expect(await screen.findByText('Loading default')).toBeInTheDocument()

    loader.resolve()
    await loaderErrorHandled
    lazyOptions.resolve(lazyPageOptions)
    await navigation

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lazy error: loader failed',
    )
  } finally {
    lazyOptions.resolve(lazyPageOptions)
    loader.resolve()
    loaderErrorHandled.resolve()
    if (navigation) {
      await Promise.allSettled([navigation])
    }
  }
})
