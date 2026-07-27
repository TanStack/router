import { afterEach, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  useRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

test('concurrent component preloads share the import', async () => {
  const componentImport = createControlledPromise<{
    default: () => null
  }>()
  const importer = vi.fn(() => componentImport)
  const Page = lazyRouteComponent(importer)

  const first = Page.preload?.()
  expect(Page.preload?.()).toBe(first)
  expect(importer).toHaveBeenCalledOnce()

  componentImport.resolve({ default: () => null })
  await first
})

test('a component loads when rendered before preload', async () => {
  const importer = vi.fn().mockResolvedValue({
    default: () => <div>Page content</div>,
  })
  const Page = lazyRouteComponent(importer)

  render(<Page />)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledOnce()
})

test('a preloaded component renders without another import', async () => {
  const importer = vi.fn().mockResolvedValue({
    default: () => <div>Page content</div>,
  })
  const Page = lazyRouteComponent(importer)

  await Page.preload?.()
  render(<Page />)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledOnce()
})

test('a failed component download is retried from the route error UI', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const PageContent = () => <div>Page content</div>
  const importer = vi
    .fn<() => Promise<{ default: typeof PageContent }>>()
    .mockRejectedValueOnce(new Error('component download failed'))
    .mockResolvedValue({ default: PageContent })
  const Page = lazyRouteComponent(importer)

  function RouteError(props: ErrorComponentProps) {
    const router = useRouter()
    return (
      <button
        type="button"
        onClick={() => {
          props.reset()
          void router.invalidate()
        }}
      >
        Retry
      </button>
    )
  }

  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
    errorComponent: RouteError,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  const retryButton = await screen.findByRole('button', { name: 'Retry' })
  expect(importer).toHaveBeenCalledTimes(1)

  await fireEvent.click(retryButton)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
})

test('a lazy error component failure after reload reaches the global error boundary', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  const importFailure = new TypeError(
    'Failed to fetch dynamically imported module: /assets/error.js',
  )
  sessionStorage.setItem(`tanstack_router_reload:${importFailure.message}`, '1')
  const ErrorPage = () => <p>Unreachable error page</p>
  const importer = vi
    .fn<() => Promise<{ default: typeof ErrorPage }>>()
    .mockRejectedValue(importFailure)
  const LazyErrorPage = lazyRouteComponent(importer)
  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: () => {
      throw new Error('page render failed')
    },
    errorComponent: LazyErrorPage,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText(importFailure.message)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument()
  expect(importer).toHaveBeenCalledOnce()
})

test('reloads once when a route component preload reports a missing module', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const failure = new TypeError(
    'Failed to fetch dynamically imported module: /assets/page.js',
  )
  const storageKey = `tanstack_router_reload:${failure.message}`
  const importer = vi.fn().mockRejectedValue(failure)
  const Page = lazyRouteComponent(importer)
  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })
  const reload = vi.fn()
  vi.stubGlobal('window', { document, location: { reload } })

  render(<RouterProvider router={router} />)

  await waitFor(() => {
    expect(sessionStorage.getItem(storageKey)).toBe('1')
  })
  expect(importer).toHaveBeenCalledOnce()
  expect(reload).toHaveBeenCalledOnce()
})

test('retries a module download from the error UI after reloading once', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const failure = new TypeError(
    'Failed to fetch dynamically imported module: /assets/page.js',
  )
  sessionStorage.setItem(`tanstack_router_reload:${failure.message}`, '1')

  const PageContent = () => <div>Page content</div>
  const importer = vi
    .fn<() => Promise<{ default: typeof PageContent }>>()
    .mockRejectedValueOnce(failure)
    .mockResolvedValue({ default: PageContent })
  const Page = lazyRouteComponent(importer)

  function RouteError(props: ErrorComponentProps) {
    const router = useRouter()
    return (
      <button
        type="button"
        onClick={() => {
          props.reset()
          void router.invalidate()
        }}
      >
        Retry
      </button>
    )
  }

  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
    errorComponent: RouteError,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })
  const reload = vi.fn()
  vi.stubGlobal('window', { document, location: { reload } })

  render(<RouterProvider router={router} />)
  await fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
  expect(reload).not.toHaveBeenCalled()
})

test('delayed lazy options replace default pending UI before the page component loads', async () => {
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
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Index page')).toBeInTheDocument()

    navigation = router.navigate({ to: '/page' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Loading default',
    )

    lazyOptions.resolve(lazyPageOptions)
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Loading lazy page')
    })
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
