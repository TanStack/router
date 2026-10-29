/**
 * The Solid route HMR runtime's cases no real page reaches. What an edit of a
 * route file shows on a page (loaders, kept and swapped components, lazy
 * wrapper identity): router-plugin `integration/route-hmr-browser*.test.ts`
 * and `known-bugs-route-hmr*.test.ts`; which hot import of a lazy wrapper
 * wins: router-core `lazy-route-component-hot.test.ts`.
 */
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
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
})

type Module = Record<string, any>

function makeComponent(label: string) {
  return function Page() {
    const [count, setCount] = createSignal(0)
    return (
      <button onClick={() => setCount(count() + 1)}>
        {label} {count()}
      </button>
    )
  }
}

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

describe('route HMR (Solid)', () => {
  test('the held component is kept when the re-imported export is the same', async () => {
    const Page = makeComponent('v1')
    const { router, evaluate } = setup(() => ({
      component: lazyRouteComponent(
        (): Promise<Module> => Promise.resolve({ component: Page }),
        'component',
      ),
    }))
    render(() => <RouterProvider router={router} />)
    fireEvent.click(await screen.findByRole('button', { name: 'v1 0' }))

    const importer = vi.fn(
      (): Promise<Module> => Promise.resolve({ component: Page }),
    )
    evaluate({ component: lazyRouteComponent(importer, 'component') })
    await importer.mock.results[0]!.value
    await Promise.resolve()
    expect(screen.getByRole('button', { name: 'v1 1' })).toBeInTheDocument()
  })

  test('a wrapper that never loaded only takes the new importer', async () => {
    const firstImporter = vi.fn(
      (): Promise<Module> =>
        Promise.resolve({ component: makeComponent('v1') }),
    )
    const { evaluate, router } = setup(() => ({
      component: lazyRouteComponent(firstImporter, 'component'),
    }))
    const secondImporter = vi.fn(
      (): Promise<Module> => Promise.resolve({ Renamed: makeComponent('v2') }),
    )
    evaluate({ component: lazyRouteComponent(secondImporter, 'Renamed') })

    render(() => <RouterProvider router={router} />)
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
    expect(firstImporter).not.toHaveBeenCalled()
    expect(secondImporter).toHaveBeenCalledOnce()
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
    render(() => <RouterProvider router={router} />)
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
  })

  test('an unsplit component is replaced by the new one', async () => {
    const { router, evaluate } = setup(() => ({
      component: makeComponent('v1'),
    }))
    render(() => <RouterProvider router={router} />)
    await screen.findByRole('button', { name: 'v1 0' })

    evaluate(
      { component: makeComponent('v2') },
      { unsplit: { component: 'Page' } },
    )
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
  })

  test('an unsplit solid-refresh component with the same binding is kept', async () => {
    const proxy = (label: string) =>
      Object.defineProperty(makeComponent(label), 'name', {
        value: '[solid-refresh]Page',
      })
    const first = proxy('v1')
    const { router, evaluate, path } = setup(() => ({ component: first }), {
      unsplit: { component: 'Page' },
    })
    render(() => <RouterProvider router={router} />)
    fireEvent.click(await screen.findByRole('button', { name: 'v1 0' }))

    evaluate({ component: proxy('v2') }, { unsplit: { component: 'Page' } })
    expect(
      (router.routesById as Record<string, AnyRoute>)[path]!.options.component,
    ).toBe(first)
    await router.load()
    // solid-refresh (absent here) patches the kept proxy in place.
    expect(screen.getByRole('button', { name: 'v1 1' })).toBeInTheDocument()

    evaluate({ component: proxy('v3') }, { unsplit: { component: 'Renamed' } })
    expect(
      await screen.findByRole('button', { name: 'v3 0' }),
    ).toBeInTheDocument()
  })

  test('an update for a route another router holds leaves both routers alone', () => {
    const firstLoader = () => 'v1'
    const { router, evaluate, path } = setup(() => ({ loader: firstLoader }))
    const otherRoot = createRootRoute()
    const other = createRouter({
      routeTree: otherRoot.addChildren([
        createRoute({ getParentRoute: () => otherRoot, path }),
      ]),
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
})
