import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import {
  RouterProvider,
  createControlledPromise,
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

test('a successful server component download is reused', async () => {
  vi.stubGlobal('window', undefined)
  const importer = vi.fn().mockResolvedValue({ default: () => null })
  const Page = lazyRouteComponent(importer)

  const preload = Page.preload?.()
  await preload

  expect(Page.preload?.()).toBe(preload)
  expect(importer).toHaveBeenCalledTimes(1)
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

  render(() => <Page />)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(1)
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

  render(() => <RouterProvider router={router} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Page content')).toBeInTheDocument()
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

  render(() => <RouterProvider router={router} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
})
