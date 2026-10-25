import * as React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
import type { AnyRoute, RouteHmrMeta } from '@tanstack/router-core'

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

async function click(text: RegExp) {
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: text }))
  })
}

describe('route HMR (React)', () => {
  test('a hot update replaces the loader, keeps generated options and shows the new data', async () => {
    const firstLoader = vi.fn(() => 'data v1')
    const { route, router, evaluate, path } = setup(() => ({
      loader: firstLoader,
      component: function Page() {
        return <p>{route.useLoaderData()}</p>
      },
    }))
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('data v1')).toBeInTheDocument()

    const secondLoader = vi.fn(() => 'data v2')
    const next = evaluate({
      loader: secondLoader,
      component: route.options.component,
    })
    expect(await screen.findByText('data v2')).toBeInTheDocument()

    const live = (router.routesById as Record<string, AnyRoute>)[path]!
    expect(live).toBe(route)
    expect(live.options.loader).toBe(secondLoader)
    expect((live.options as any).path).toBe(path)
    expect(next.options).toBe(live.options)
    expect(next.id).toBe(live.id)
    expect(firstLoader).toHaveBeenCalledTimes(1)
    expect(secondLoader).toHaveBeenCalled()
  })

  test('an unsplit component is swapped without a refresh runtime', async () => {
    const { router, evaluate } = setup(
      () => ({ component: makeComponent('v1') }),
      { unsplit: { component: 'Page' } },
    )
    render(<RouterProvider router={router} />)
    await click(/v1 0/)

    evaluate(
      { component: makeComponent('v2') },
      { unsplit: { component: 'Page' } },
    )
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
  })

  test('an unsplit component with the same binding is kept for React Refresh', async () => {
    ;(window as any).__registerBeforePerformReactRefresh = () => {}
    const first = makeComponent('v1')
    const { router, evaluate, path } = setup(() => ({ component: first }), {
      unsplit: { component: 'Page' },
    })
    render(<RouterProvider router={router} />)
    await click(/v1 0/)

    evaluate(
      { component: makeComponent('v2') },
      { unsplit: { component: 'Page' } },
    )
    expect(
      (router.routesById as Record<string, AnyRoute>)[path]!.options.component,
    ).toBe(first)
    // The refresh runtime (absent here) patches the kept component in place.
    expect(
      await screen.findByRole('button', { name: 'v1 1' }),
    ).toBeInTheDocument()
  })

  test('a renamed unsplit component is swapped even with React Refresh', async () => {
    ;(window as any).__registerBeforePerformReactRefresh = () => {}
    const { router, evaluate } = setup(
      () => ({ component: makeComponent('v1') }),
      { unsplit: { component: 'Page' } },
    )
    render(<RouterProvider router={router} />)

    evaluate(
      { component: makeComponent('v2') },
      { unsplit: { component: 'Renamed' } },
    )
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
  })

  test('a kept unsplit component asks the webpack/Rspack refresh runtime to run', async () => {
    const enqueueUpdate = vi.fn()
    vi.stubGlobal('__react_refresh_utils__', { enqueueUpdate })
    const first = makeComponent('v1')
    const { router, evaluate, path } = setup(() => ({ component: first }), {
      unsplit: { component: 'Page' },
    })
    render(<RouterProvider router={router} />)
    await screen.findByRole('button', { name: 'v1 0' })

    evaluate(
      { component: makeComponent('v2') },
      { unsplit: { component: 'Page' } },
    )
    expect(
      (router.routesById as Record<string, AnyRoute>)[path]!.options.component,
    ).toBe(first)
    expect(enqueueUpdate).toHaveBeenCalledOnce()
  })

  test('the live lazy wrapper is kept, re-imports, and swaps to a new component', async () => {
    const firstImporter = vi.fn(
      (): Promise<Module> =>
        Promise.resolve({
          component: makeComponent('v1'),
        }),
    )
    const { router, evaluate, path } = setup(() => ({
      component: lazyRouteComponent(firstImporter, 'component'),
    }))
    const wrapper = (router.routesById as Record<string, AnyRoute>)[path]!
      .options.component
    render(<RouterProvider router={router} />)
    await click(/v1 0/)

    const secondImporter = vi.fn(
      (): Promise<Module> =>
        Promise.resolve({
          component: makeComponent('v2'),
        }),
    )
    const next = evaluate({
      component: lazyRouteComponent(secondImporter, 'component'),
    })
    expect(
      (router.routesById as Record<string, AnyRoute>)[path]!.options.component,
    ).toBe(wrapper)
    expect(next.options.component).toBe(wrapper)
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
    expect(secondImporter).toHaveBeenCalledOnce()
  })

  test('the held split component is kept when the loaded export has the same refresh id', async () => {
    ;(window as any).__registerBeforePerformReactRefresh = () => {}
    const marked = (label: string, id: string) =>
      Object.assign(makeComponent(label), { $$tsrRefreshId: id })
    const { router, evaluate } = setup(() => ({
      component: lazyRouteComponent(
        (): Promise<Module> =>
          Promise.resolve({
            component: marked('v1', '/page?tsr-split=component Split'),
          }),
        'component',
      ),
    }))
    render(<RouterProvider router={router} />)
    await click(/v1 0/)

    const sameId = vi.fn(
      (): Promise<Module> =>
        Promise.resolve({
          component: marked('v2', '/page?tsr-split=component Split'),
        }),
    )
    evaluate({ component: lazyRouteComponent(sameId, 'component') })
    await act(() => sameId.mock.results[0]!.value)
    expect(sameId).toHaveBeenCalledOnce()
    // Kept: React Refresh patches the held component, its state survives.
    expect(screen.getByRole('button', { name: 'v1 1' })).toBeInTheDocument()

    // A grouping change gives another chunk id: a new family, so swap.
    evaluate({
      component: lazyRouteComponent(
        (): Promise<Module> =>
          Promise.resolve({
            component: marked('v3', '/page?tsr-split=component---loader Split'),
          }),
        'component',
      ),
    })
    expect(
      await screen.findByRole('button', { name: 'v3 0' }),
    ).toBeInTheDocument()
  })

  test('a marked split component is swapped when no refresh runtime runs', async () => {
    const marked = (label: string) =>
      Object.assign(makeComponent(label), { $$tsrRefreshId: 'chunk Split' })
    const { router, evaluate } = setup(() => ({
      component: lazyRouteComponent(
        (): Promise<Module> => Promise.resolve({ component: marked('v1') }),
        'component',
      ),
    }))
    render(<RouterProvider router={router} />)
    await screen.findByRole('button', { name: 'v1 0' })

    evaluate({
      component: lazyRouteComponent(
        (): Promise<Module> => Promise.resolve({ component: marked('v2') }),
        'component',
      ),
    })
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
  })

  test('only the newest import decides what a hot-updated wrapper renders', async () => {
    const { router, evaluate } = setup(() => ({
      component: lazyRouteComponent(
        (): Promise<Module> =>
          Promise.resolve({ component: makeComponent('v1') }),
        'component',
      ),
    }))
    render(<RouterProvider router={router} />)
    await screen.findByRole('button', { name: 'v1 0' })

    const second = createControlledPromise<Module>()
    const third = createControlledPromise<Module>()
    evaluate({ component: lazyRouteComponent(() => second, 'component') })
    evaluate({ component: lazyRouteComponent(() => third, 'component') })

    third.resolve({ component: makeComponent('v3') })
    await act(() => third)
    expect(
      await screen.findByRole('button', { name: 'v3 0' }),
    ).toBeInTheDocument()

    second.resolve({ component: makeComponent('v2') })
    await act(() => second)
    expect(screen.getByRole('button', { name: 'v3 0' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /v2/ })).not.toBeInTheDocument()
  })

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

  test('React + Vite: every export of the route module but the anchor is ignored by plugin-react', () => {
    const previous = vi.fn(() => ['fromPrevious'])
    ;(window as any).__getReactRefreshIgnoredExports = previous
    const meta = {
      refreshExports: {
        id: '/src/routes/ignored.tsx',
        anchor: 'TsrFastRefreshAnchor',
        exports: ['Route', 'helper', 'TsrFastRefreshAnchor'],
      },
    }
    setup(() => ({}), meta)
    const getIgnored = (window as any).__getReactRefreshIgnoredExports
    expect(getIgnored({ id: '/src/routes/ignored.tsx' })).toEqual([
      'fromPrevious',
      'Route',
      'helper',
    ])
    expect(getIgnored({ id: '/src/other.tsx' })).toEqual(['fromPrevious'])
  })
})
