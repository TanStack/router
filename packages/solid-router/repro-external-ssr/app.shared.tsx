// Shared app definition for the external-SSR hydration repro.
// Protocol-less external SSR: the app server-renders RouterProvider
// directly (no RouterServer/RouterClient, no $_TSR), per the recipe:
// memory history + `await router.load()` before render/hydrate.
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
      return { message: `loader-data-run-${loaderRuns.count}` }
    },
    component: () => {
      const data = indexRoute.useLoaderData()
      return <main id="home">Home: {data().message}</main>
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
