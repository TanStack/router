// Shared app definition for the external-SSR hydration repro.
// Protocol-less external SSR: the app server-renders RouterProvider
// directly (no RouterServer/RouterClient, no $_TSR), per the recipe:
// memory history + renderToStream — the provider owns the load dispatch.
import * as Solid from 'solid-js'
import {
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { lazyRouteComponent } from '../src/lazyRouteComponent'

// Loader dispatch counter, visible to the harness: the Phase 1 boot must
// hydrate from transferred state without re-running loaders.
export const loaderRuns = { count: 0 }

export function createAppRouter() {
  let resolveAboutChunk!: (mod: { default: () => any }) => void
  const aboutChunkPromise = new Promise<{ default: () => any }>((resolve) => {
    resolveAboutChunk = resolve
  })

  const rootRoute = createRootRoute({
    component: () => (
      <div id="shell">
        <h1>Shell</h1>
        <Outlet />
      </div>
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: async () => {
      loaderRuns.count++
      await new Promise((r) => setTimeout(r, 10))
      return {
        message: `loader-data-run-${loaderRuns.count}`,
        // Deferred value (TanStack streaming contract): the loader does NOT
        // await this — it must transfer as a promise-valued registry field,
        // stream its resolution, and be consumed by <Await> on the client
        // without re-running.
        slow: new Promise<string>((resolve) =>
          setTimeout(() => resolve(`deferred-data-run-${loaderRuns.count}`), 30),
        ),
      }
    },
    component: () => {
      const data = indexRoute.useLoaderData()
      // Native deferred consumption — no <Await>: a memo returning the
      // promise is an async node; reading it parks under the Loading
      // boundary until the value lands (streamed on the server, adopted on
      // the client).
      const slow = Solid.createMemo(() => data().slow)
      return (
        <main id="home">
          Home: {data().message}
          <Solid.Loading
            fallback={<span id="deferred-fallback">deferred pending</span>}
          >
            <span id="deferred">{slow()}</span>
          </Solid.Loading>
        </main>
      )
    },
  })

  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    component: lazyRouteComponent(() => aboutChunkPromise),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingComponent: () => <div id="pending">PENDING UI</div>,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })

  return { router, resolveAboutChunk }
}
