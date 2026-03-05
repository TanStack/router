import { describe, expect, it } from 'vitest'
import { renderToStringAsync } from 'solid-js/web'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'

describe('ssr: data-only with pendingComponent (server)', () => {
  it('should render pendingComponent during SSR when ssr is data-only', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      ssr: 'data-only',
      pendingComponent: () => (
        <div data-testid="pending">Loading...</div>
      ),
      loader: async () => {
        return { message: 'loaded' }
      },
      component: () => <div data-testid="content">Route Content</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const html = await renderToStringAsync(() => (
      <RouterProvider router={router} />
    ))

    expect(html).toContain('Loading...')
    expect(html).not.toContain('Route Content')
  })

  it('should render pendingComponent during SSR when ssr is false', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      ssr: false,
      pendingComponent: () => (
        <div data-testid="pending">Loading...</div>
      ),
      loader: async () => {
        return { message: 'loaded' }
      },
      component: () => <div data-testid="content">Route Content</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const html = await renderToStringAsync(() => (
      <RouterProvider router={router} />
    ))

    expect(html).toContain('Loading...')
    expect(html).not.toContain('Route Content')
  })

  it('should render defaultPendingComponent during SSR for data-only routes', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      ssr: 'data-only',
      loader: async () => {
        return { message: 'loaded' }
      },
      component: () => <div data-testid="content">Route Content</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultPendingComponent: () => (
        <div data-testid="default-pending">Default Loading...</div>
      ),
    })

    await router.load()

    const html = await renderToStringAsync(() => (
      <RouterProvider router={router} />
    ))

    expect(html).toContain('Default Loading...')
    expect(html).not.toContain('Route Content')
  })

  it('should not render route component during SSR for data-only routes', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      ssr: 'data-only',
      pendingComponent: () => (
        <div data-testid="pending">Loading...</div>
      ),
      loader: async () => {
        return { message: 'loaded' }
      },
      component: () => <div data-testid="content">Route Content</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const html = await renderToStringAsync(() => (
      <RouterProvider router={router} />
    ))

    expect(html).toContain('Loading...')
    expect(html).not.toContain('Route Content')
  })
})
