import { createSignal } from 'solid-js'
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import {
  bindCreateModuleRoot,
  bindRouteScopeCreateLink,
  bindRouteScopeLink,
  mountRouteModule,
} from '../src/route-module-internal'

afterEach(() => cleanup())

/** Renders an application whose root is `Home` and mounts module `@m` at `/shop`. */
function renderApp(Home: () => any) {
  const moduleRoot = bindCreateModuleRoot<unknown, '@m'>('@m')()({}) as any
  moduleRoot.addChildren([
    createRoute({
      getParentRoute: () => moduleRoot,
      path: '/item/$id',
      component: () => <span>item</span>,
    }),
  ])
  const rootRoute = createRootRoute({ component: Home })
  const mounted = mountRouteModule(moduleRoot, {
    parent: () => rootRoute,
    at: '/shop',
  } as any)
  const router = createRouter({
    routeTree: rootRoute.addChildren([mounted]) as any,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(() => <RouterProvider router={router as any} />)
}

const ScopedLink = bindRouteScopeLink<any>('@m')
const ScopedCustomLink = bindRouteScopeCreateLink<any>('@m')((props: any) => (
  <a {...props} />
))

test.each([
  ['Link', ScopedLink],
  ['createLink', ScopedCustomLink],
] as const)(
  'a scoped %s keeps the reactivity of each prop',
  async (_, Component) => {
    let childrenReads = 0
    const [id, setId] = createSignal('one')
    const AnyComponent = Component as any
    renderApp(() => (
      <>
        <AnyComponent to="/item/$id" params={{ id: id() }}>
          {(childrenReads++, (<span data-testid="child">child</span>))}
        </AnyComponent>
        <Outlet />
      </>
    ))
    const child = await screen.findByTestId('child')
    const anchor = child.parentElement as HTMLAnchorElement
    expect(anchor.getAttribute('href')).toBe('/shop/item/one')
    expect(childrenReads).toBe(1)

    setId('two')
    await waitFor(() =>
      expect(anchor.getAttribute('href')).toBe('/shop/item/two'),
    )
    // A params change neither re-creates the children nor the element.
    expect(childrenReads).toBe(1)
    expect(screen.getByTestId('child')).toBe(child)
  },
)
