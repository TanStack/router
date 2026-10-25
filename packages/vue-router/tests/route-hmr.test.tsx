import * as Vue from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
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
})

type Module = Record<string, any>

function makeComponent(label: string, hmrId?: string) {
  const component = Vue.defineComponent({
    setup() {
      const count = Vue.ref(0)
      return () => (
        <button onClick={() => count.value++}>
          {label} {count.value}
        </button>
      )
    },
  })
  if (hmrId) {
    ;(component as any).__hmrId = hmrId
  }
  return component
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

describe('route HMR (Vue)', () => {
  test('a hot update replaces the loader and shows the new data', async () => {
    const { route, router, evaluate, path } = setup(() => ({
      loader: () => 'data v1',
      component: Vue.defineComponent({
        setup() {
          const data = route.useLoaderData()
          return () => <p>{data.value}</p>
        },
      }),
    }))
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('data v1')).toBeInTheDocument()

    const next = evaluate({
      loader: () => 'data v2',
      component: route.options.component,
    })
    expect(await screen.findByText('data v2')).toBeInTheDocument()
    expect((router.routesById as Record<string, AnyRoute>)[path]).toBe(route)
    expect(next.options).toBe(route.options)
  })

  test('the live lazy wrapper is kept and swaps to the re-imported component', async () => {
    const { router, evaluate, path } = setup(() => ({
      component: lazyRouteComponent(
        (): Promise<Module> =>
          Promise.resolve({ component: makeComponent('v1') }),
        'component',
      ),
    }))
    const wrapper = (router.routesById as Record<string, AnyRoute>)[path]!
      .options.component
    render(<RouterProvider router={router} />)
    await fireEvent.click(await screen.findByRole('button', { name: 'v1 0' }))

    const importer = vi.fn(
      (): Promise<Module> =>
        Promise.resolve({ component: makeComponent('v2') }),
    )
    evaluate({ component: lazyRouteComponent(importer, 'component') })
    expect(
      (router.routesById as Record<string, AnyRoute>)[path]!.options.component,
    ).toBe(wrapper)
    expect(
      await screen.findByRole('button', { name: 'v2 0' }),
    ).toBeInTheDocument()
    expect(importer).toHaveBeenCalledOnce()
  })

  test('the held component is kept when the loaded export has the same __hmrId', async () => {
    const { router, evaluate } = setup(() => ({
      component: lazyRouteComponent(
        (): Promise<Module> =>
          Promise.resolve({
            component: makeComponent('v1', 'hmr-page'),
          }),
        'component',
      ),
    }))
    render(<RouterProvider router={router} />)
    await fireEvent.click(await screen.findByRole('button', { name: 'v1 0' }))

    const importer = vi.fn(
      (): Promise<Module> =>
        Promise.resolve({
          component: makeComponent('v2', 'hmr-page'),
        }),
    )
    evaluate({ component: lazyRouteComponent(importer, 'component') })
    await importer.mock.results[0]!.value
    await Vue.nextTick()
    // Kept: plugin-vue-jsx (absent here) reloads the held definition in place.
    expect(screen.getByRole('button', { name: 'v1 1' })).toBeInTheDocument()
  })

  test('a function component is always swapped', async () => {
    const fn = (label: string) => () => <span>{label}</span>
    const { router, evaluate } = setup(() => ({
      component: lazyRouteComponent(
        (): Promise<Module> => Promise.resolve({ component: fn('fn v1') }),
        'component',
      ),
    }))
    render(<RouterProvider router={router} />)
    await screen.findByText('fn v1')

    evaluate({
      component: lazyRouteComponent(
        (): Promise<Module> => Promise.resolve({ component: fn('fn v2') }),
        'component',
      ),
    })
    expect(await screen.findByText('fn v2')).toBeInTheDocument()
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
    expect(
      await screen.findByRole('button', { name: 'v3 0' }),
    ).toBeInTheDocument()
    second.resolve({ component: makeComponent('v2') })
    await second
    await Vue.nextTick()
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

  test('an unsplit component is replaced unless it keeps its __hmrId', async () => {
    const first = makeComponent('v1', 'hmr-unsplit')
    const { router, evaluate, path } = setup(() => ({ component: first }))
    render(<RouterProvider router={router} />)
    await fireEvent.click(await screen.findByRole('button', { name: 'v1 0' }))

    evaluate({ component: makeComponent('v2', 'hmr-unsplit') })
    expect(
      (router.routesById as Record<string, AnyRoute>)[path]!.options.component,
    ).toBe(first)

    evaluate({ component: makeComponent('v3') })
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
    vi.stubGlobal('document', undefined)
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
