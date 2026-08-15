import ReactDOM from 'react-dom/client'
import { useSyncExternalStore } from 'react'
import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from '@tanstack/react-router'

/**
 * `<Navigate>` re-issues its navigation from an effect guarded by an identity
 * check on the JSX props object. React allocates a fresh props object on every
 * render, so an identity check never holds and the navigation is re-issued on
 * every render.
 *
 * That is only observable when the component rendering `<Navigate>` re-renders,
 * which the three routes below are the realistic ways of causing.
 *
 * Subscribing to router state is enough on its own: issuing the navigation
 * changes router state, which re-renders the component, which re-issues the
 * navigation. No external input and no async destination are needed.
 *
 * An async destination makes it worse rather than being a precondition. It
 * stays pending across the re-renders, so each re-issue supersedes the previous
 * one and restarts its `beforeLoad`, turning the render loop into unbounded
 * requests.
 *
 * `MAX_RENDERS` bounds the loop so a regressed build fails the assertions
 * instead of exhausting the browser tab.
 */

const MAX_RENDERS = 25

const stats = {
  /** Renders of the component that returns `<Navigate>`. */
  redirectRenders: 0,
  /** Invocations of the destination route's async `beforeLoad`. */
  targetBeforeLoads: 0,
  /** Sticky: set once the render guard trips, survives the redirect unmount. */
  loopDetected: false,
}

declare global {
  interface Window {
    __navigateStats: typeof stats
  }
}

window.__navigateStats = stats

/** Returns true once the redirect component has rendered suspiciously often. */
function trackRender() {
  stats.redirectRenders++
  if (stats.redirectRenders > MAX_RENDERS) {
    stats.loopDetected = true
    return true
  }
  return false
}

/**
 * An external store that keeps ticking while a navigation is pending, standing
 * in for the data-fetching subscriptions apps commonly hold in redirect
 * components.
 */
let tick = 0
const listeners = new Set<() => void>()
setInterval(() => {
  tick++
  listeners.forEach((listener) => listener())
}, 20)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div>
      <h1>Navigate component</h1>
      <div data-testid="pathname">{pathname}</div>
      <hr />
      <Outlet />
    </div>
  )
}

const rootRoute = createRootRoute({ component: RootComponent })

/** Re-renders because it subscribes to router state, with no external input. */
function RedirectViaRouterState() {
  useRouterState()

  if (trackRender()) {
    return <div data-testid="loop-detected">loop detected</div>
  }

  return <Navigate to="/target" replace />
}

/** Re-renders because an unrelated external store keeps emitting. */
function RedirectViaExternalStore() {
  useSyncExternalStore(subscribe, () => tick)

  if (trackRender()) {
    return <div data-testid="loop-detected">loop detected</div>
  }

  return <Navigate to="/async-target" replace />
}

/** Re-renders like the above, but passes `search` as an updater function. */
function RedirectWithFunctionSearch() {
  useRouterState()

  if (trackRender()) {
    return <div data-testid="loop-detected">loop detected</div>
  }

  return <Navigate to="/target" search={(prev) => ({ ...prev })} replace />
}

const functionSearchRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/redirect-function-search',
  component: RedirectWithFunctionSearch,
})

const routerStateRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/redirect-router-state',
  component: RedirectViaRouterState,
})

const externalStoreRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/redirect-external-store',
  component: RedirectViaExternalStore,
})

const targetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/target',
  component: () => <div data-testid="target-content">Target</div>,
})

// A destination that does not resolve synchronously stays pending across the
// re-renders, so each re-issue supersedes the previous one and restarts this
// guard. That is what turns the loop into unbounded requests.
const asyncTargetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/async-target',
  beforeLoad: async () => {
    stats.targetBeforeLoads++
    await new Promise((resolve) => setTimeout(resolve, 150))
  },
  component: () => <div data-testid="target-content">Async target</div>,
})

const routeTree = rootRoute.addChildren([
  routerStateRedirectRoute,
  externalStoreRedirectRoute,
  functionSearchRedirectRoute,
  targetRoute,
  asyncTargetRoute,
])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(<RouterProvider router={router} />)
}
