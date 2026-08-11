import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

const rootRoute = createRootRoute()
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => new Promise((resolve) => setTimeout(resolve, 1_000)),
  component: () => <div data-state="loaded">loaded</div>,
})
const routePendingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/route-pending',
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: () => (
    <div data-state="pending" data-pending-source="route">
      route pending
    </div>
  ),
  loader: () => new Promise((resolve) => setTimeout(resolve, 1_000)),
  component: () => <div data-state="loaded">loaded</div>,
})
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, routePendingRoute]),
})
const usesRoutePending = window.location.pathname === '/route-pending'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <main data-state="shell">
      <RouterProvider
        router={router}
        defaultPendingMs={usesRoutePending ? 1_000 : 0}
        defaultPendingMinMs={0}
        defaultPendingComponent={() => (
          <div data-state="pending" data-pending-source="default">
            default pending
          </div>
        )}
      />
    </main>
  </StrictMode>,
)
