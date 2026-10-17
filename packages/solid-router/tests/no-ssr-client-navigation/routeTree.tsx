import { createSignal, onMount } from 'solid-js'
import { HydrationScript } from 'solid-js/web'
import { Outlet, Scripts, createRootRoute, createRoute } from '../../src'

export type NavigationCase = {
  ssr: 'data-only' | false
  pending: boolean
}

/** Mounts of the route component in this module graph. */
export const stats = { mounts: 0 }

/**
 * The same application module, compiled for the server entry and for the
 * hydrating client entry. Start's client build removes the `ssr` option, so
 * only the server has it. The root route renders the document, as in Solid
 * Start.
 */
export function createRouteTree(
  entry: NavigationCase,
  env: 'server' | 'client',
) {
  const rootRoute = createRootRoute({
    component: () => (
      <html>
        <head>
          <HydrationScript />
        </head>
        <body>
          <Outlet />
          <Scripts />
        </body>
      </html>
    ),
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    ...(env === 'server' ? { ssr: entry.ssr } : {}),
    loader: ({ params }) => `item ${params.id}`,
    ...(entry.pending
      ? { pendingComponent: () => <p data-testid="pending">Loading</p> }
      : {}),
    component: function Item() {
      const data = itemRoute.useLoaderData()
      const [count, setCount] = createSignal(0)
      onMount(() => {
        stats.mounts++
      })
      return (
        <button
          data-testid="item"
          onClick={() => setCount((value) => value + 1)}
        >
          {data()} count={count()}
        </button>
      )
    },
  })
  return rootRoute.addChildren([itemRoute])
}
