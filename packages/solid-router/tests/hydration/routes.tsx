import { createSignal } from 'solid-js'
import {
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'
import type { AnyRoute } from '@tanstack/router-core'

export function Page() {
  const [count, setCount] = createSignal(0)
  return (
    <main>
      Page body
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </main>
  )
}

export function makeRouter(
  configurePage: (pageRoute: AnyRoute) => AnyRoute,
  component?: any,
  isServer?: boolean,
) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <header>Header</header>
        <Outlet />
      </>
    ),
  })
  const pageRoute = configurePage(
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      component,
    }),
  )
  return createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    isServer,
  })
}
