import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { RouterHistory } from '../src'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  cleanup()
  vi.useRealTimers()
})

describe('transactional route loading', () => {
  test('publishes a parent and child background refresh atomically after the child observes fresh parent data', async () => {
    const parentRefresh = deferred<string>()
    const childRefresh = deferred<void>()
    const childObservedFreshParent = deferred<void>()
    let parentLoads = 0
    let childLoads = 0

    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Link to="/other">Other route</Link>
          <Link to="/parent/child">Data route</Link>
          <Outlet />
        </>
      ),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home route</div>,
    })
    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      component: () => <div>Other route content</div>,
    })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      staleTime: 0,
      gcTime: 60_000,
      loader: async () => {
        parentLoads += 1
        if (parentLoads === 1) {
          return 'parent-v1'
        }
        return parentRefresh.promise
      },
      component: () => (
        <>
          <div>{parentRoute.useLoaderData()}</div>
          <Outlet />
        </>
      ),
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      staleTime: 0,
      gcTime: 60_000,
      loader: async ({ parentMatchPromise }) => {
        childLoads += 1
        const parentMatch = await parentMatchPromise
        const parentData = parentMatch.loaderData as string
        if (childLoads > 1) {
          childObservedFreshParent.resolve(undefined)
          await childRefresh.promise
        }
        return `child-saw-${parentData}`
      },
      component: () => <div>{childRoute.useLoaderData()}</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        otherRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history,
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Home route')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Data route'))

    expect(await screen.findByText('parent-v1')).toBeInTheDocument()
    expect(await screen.findByText('child-saw-parent-v1')).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 2))
    fireEvent.click(screen.getByText('Other route'))
    expect(await screen.findByText('Other route content')).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 2))
    fireEvent.click(screen.getByText('Data route'))

    expect(await screen.findByText('parent-v1')).toBeInTheDocument()
    expect(await screen.findByText('child-saw-parent-v1')).toBeInTheDocument()

    await act(async () => {
      parentRefresh.resolve('parent-v2')
      await childObservedFreshParent.promise
    })

    expect(screen.getByText('parent-v1')).toBeInTheDocument()
    expect(screen.getByText('child-saw-parent-v1')).toBeInTheDocument()
    expect(screen.queryByText('parent-v2')).not.toBeInTheDocument()
    expect(screen.queryByText('child-saw-parent-v2')).not.toBeInTheDocument()

    await act(async () => {
      childRefresh.resolve(undefined)
      await Promise.resolve()
    })

    expect(await screen.findByText('parent-v2')).toBeInTheDocument()
    expect(await screen.findByText('child-saw-parent-v2')).toBeInTheDocument()
    expect(screen.queryByText('parent-v1')).not.toBeInTheDocument()
    expect(screen.queryByText('child-saw-parent-v1')).not.toBeInTheDocument()
  })

  test('renders a leaf error at the leaf boundary when its background refresh fails', async () => {
    let loads = 0
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <div>Root shell</div>
          <Outlet />
        </>
      ),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <Link to="/parent/child">Open child</Link>,
    })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      component: () => (
        <>
          <div>Parent shell</div>
          <Outlet />
        </>
      ),
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: {
        staleReloadMode: 'background',
        handler: () => {
          loads++
          if (loads > 1) {
            throw new Error('background refresh failed')
          }
          return 'child data'
        },
      },
      component: () => <div>{childRoute.useLoaderData()}</div>,
      errorComponent: () => <div>Child refresh failed</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history,
    })

    render(<RouterProvider router={router} />)
    fireEvent.click(await screen.findByText('Open child'))
    expect(await screen.findByText('child data')).toBeInTheDocument()

    await act(() => router.invalidate())

    expect(await screen.findByText('Child refresh failed')).toBeInTheDocument()
    expect(screen.getByText('Root shell')).toBeInTheDocument()
    expect(screen.getByText('Parent shell')).toBeInTheDocument()
  })
})
