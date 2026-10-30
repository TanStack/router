/**
 * The React route HMR runtime's cases no real page reaches. What an edit of a
 * route file shows on a page (loaders, kept and swapped components, lazy
 * wrapper identity): router-plugin `integration/route-hmr-browser*.test.ts`
 * and `known-bugs-route-hmr*.test.ts`; which hot import of a lazy wrapper
 * wins: router-core `lazy-route-component-hot.test.ts`.
 */
import * as React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createControlledPromise } from '@tanstack/router-core'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '../src'
import { __tsrRouteHmr } from '../src/hmr'
import type { AnyRoute } from '@tanstack/router-core'
import type { RouteHmrMeta } from '@tanstack/router-core/hmr'

// Each test uses its own route id: route HMR remembers routes by id for the
// lifetime of the page, as it does in a real dev session.
let nextRouteId = 0

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (window as any).__registerBeforePerformReactRefresh
  delete (window as any).__getReactRefreshIgnoredExports
})

type Module = Record<string, any>

function Counter({ label }: { label: string }) {
  const [count, setCount] = React.useState(0)
  return (
    <button onClick={() => setCount(count + 1)}>
      {label} {count}
    </button>
  )
}

function makeComponent(label: string) {
  return function Page() {
    return <Counter label={label} />
  }
}

/**
 * Sets up an app whose `/page` route module can be evaluated again, the way
 * the compiler's dev-only block evaluates it on every hot update.
 */
function setup(
  firstOptions: () => Record<string, any>,
  firstMeta: RouteHmrMeta = {},
) {
  const path = `/page${nextRouteId++}`
  const rootRoute = createRootRoute()
  const evaluate = (options: Record<string, any>, meta: RouteHmrMeta = {}) => {
    const Route = createRoute({
      getParentRoute: () => rootRoute,
      path,
      ...options,
    } as any)
    __tsrRouteHmr(path, Route, meta)
    return Route
  }
  const route = evaluate(firstOptions(), firstMeta)
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  return { path, route, router, evaluate }
}

describe('route HMR (React)', () => {
  test('a first load that a hot update replaced settles with the newer component', async () => {
    const first = createControlledPromise<Module>()
    const second = createControlledPromise<Module>()
    const wrapper = lazyRouteComponent(() => first, 'component')
    const { router, evaluate } = setup(() => ({ component: wrapper }))
    const preload = wrapper.preload!()
    evaluate({ component: lazyRouteComponent(() => second, 'component') })

    first.resolve({ component: makeComponent('v1') })
    second.resolve({ component: makeComponent('v2') })
    await preload
    render(<RouterProvider router={router} />)
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
  })

  test('a wrapper that never loaded only takes the new importer', async () => {
    const firstImporter = vi.fn(
      (): Promise<Module> =>
        Promise.resolve({
          component: makeComponent('v1'),
        }),
    )
    const { evaluate, router, path } = setup(() => ({
      component: lazyRouteComponent(firstImporter, 'component'),
    }))
    const wrapper = (router.routesById as Record<string, AnyRoute>)[path]!
      .options.component
    const secondImporter = vi.fn(
      (): Promise<Module> =>
        Promise.resolve({
          component: makeComponent('v2'),
        }),
    )
    evaluate({ component: lazyRouteComponent(secondImporter, 'component') })
    expect(
      (router.routesById as Record<string, AnyRoute>)[path]!.options.component,
    ).toBe(wrapper)

    render(<RouterProvider router={router} />)
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
    expect(firstImporter).not.toHaveBeenCalled()
    expect(secondImporter).toHaveBeenCalledOnce()
  })

  test('Vite bundled dev: a chunk the page never loaded is imported through the first importer', async () => {
    // Rolldown's dev runtime throws this from an HMR patch's `import()` of a
    // chunk the page never loaded.
    class MissingFactoryError extends Error {}
    const firstImporter = vi.fn(
      (): Promise<Module> =>
        Promise.resolve({ component: makeComponent('v1') }),
    )
    const wrapper = lazyRouteComponent(firstImporter, 'component')
    const { router, evaluate } = setup(() => ({ component: wrapper }))
    const patchImporter = vi.fn((): Promise<Module> => {
      throw new MissingFactoryError(
        'No factory registered for module src/routes/page.tsx?tsr-split=component',
      )
    })
    // Two saves while the route is not shown, then a preload in flight
    // (a pending navigation) during a third save.
    evaluate({ component: lazyRouteComponent(patchImporter, 'component') })
    evaluate({ component: lazyRouteComponent(patchImporter, 'component') })
    const preload = wrapper.preload!()
    evaluate({ component: lazyRouteComponent(patchImporter, 'component') })
    await preload

    render(<RouterProvider router={router} />)
    expect(
      await screen.findByRole('button', { name: 'v1 0' }),
    ).toBeInTheDocument()
    // Every import through the patch fell back to the first importer.
    expect(patchImporter).toHaveBeenCalled()
    expect(firstImporter).toHaveBeenCalledTimes(patchImporter.mock.calls.length)
    const firstImporterCalls = firstImporter.mock.calls.length

    // Any other failure of the new importer is not covered up.
    evaluate({
      component: lazyRouteComponent(
        (): Promise<Module> => Promise.reject(new Error('syntax error')),
        'component',
      ),
    })
    await act(async () => {})
    expect(firstImporter).toHaveBeenCalledTimes(firstImporterCalls)
    expect(screen.queryByRole('button', { name: /v1/ })).not.toBeInTheDocument()
  })

  test('an update for a route another router holds leaves both routers alone', () => {
    const firstLoader = () => 'v1'
    const { router, evaluate, path } = setup(() => ({ loader: firstLoader }))
    // A second router created later becomes `window.__TSR_ROUTER__`.
    const otherRoot = createRootRoute()
    const otherRoute = createRoute({ getParentRoute: () => otherRoot, path })
    const other = createRouter({
      routeTree: otherRoot.addChildren([otherRoute]),
      history: createMemoryHistory({ initialEntries: [path] }),
    })
    expect(window.__TSR_ROUTER__).toBe(other)

    expect(() => evaluate({ loader: () => 'v2' })).not.toThrow()
    expect(
      (router.routesById as Record<string, AnyRoute>)[path]!.options.loader,
    ).toBe(firstLoader)
    expect(
      (other.routesById as Record<string, AnyRoute>)[path]!.options.loader,
    ).toBeUndefined()
  })

  test('an update for a route id the router does not have does nothing', () => {
    const { evaluate, router } = setup(() => ({}))
    const before = router.routesById
    window.__TSR_ROUTER__ = undefined
    expect(() => evaluate({ loader: () => 'v2' })).not.toThrow()
    window.__TSR_ROUTER__ = router
    expect(router.routesById).toBe(before)
  })

  test('on the server the helper does nothing and wrappers have no hot slot', () => {
    const firstLoader = () => 'v1'
    const { router, evaluate, path } = setup(() => ({ loader: firstLoader }))
    vi.stubGlobal('window', undefined)
    const wrapper = lazyRouteComponent(() =>
      Promise.resolve({ default: () => null }),
    )
    expect((wrapper as any).__tsrHot).toBeUndefined()
    evaluate({ loader: () => 'v2' })
    vi.unstubAllGlobals()
    expect(
      (router.routesById as Record<string, AnyRoute>)[path]!.options.loader,
    ).toBe(firstLoader)
  })

  test('React + Vite: every export of the route module but the anchor is ignored by plugin-react while the router holds its route', () => {
    const previous = vi.fn(() => ['fromPrevious'])
    ;(window as any).__getReactRefreshIgnoredExports = previous
    const meta = {
      refreshExports: {
        id: '/src/routes/ignored.tsx',
        anchor: 'TsrFastRefreshAnchor',
        exports: ['Route', 'helper', 'TsrFastRefreshAnchor'],
      },
    }
    const rootRoute = createRootRoute()
    const evaluate = (path: string, token: string, routeMeta = {}) => {
      const Route = createRoute({
        getParentRoute: () => rootRoute,
        path,
        loader: () => token,
      })
      __tsrRouteHmr(path, Route, routeMeta)
      return Route
    }
    const ignoredRoute = evaluate('/ignored', 'v0', meta)
    const otherRoute = evaluate('/ignored-other', 'v0')
    createRouter({
      routeTree: rootRoute.addChildren([ignoredRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/ignored-other'] }),
    })
    const getIgnored = (window as any).__getReactRefreshIgnoredExports
    expect(getIgnored({ id: '/src/routes/ignored.tsx' })).toEqual([
      'fromPrevious',
      'Route',
      'helper',
    ])
    expect(getIgnored({ id: '/src/other.tsx' })).toEqual(['fromPrevious'])

    // The route tree module drops `/ignored` (its file was removed or
    // renamed); the router reads the tree again on an edit of another route.
    rootRoute.addChildren([otherRoute])
    evaluate('/ignored-other', 'v1')
    expect(getIgnored({ id: '/src/routes/ignored.tsx' })).toEqual([
      'fromPrevious',
    ])
  })
})
