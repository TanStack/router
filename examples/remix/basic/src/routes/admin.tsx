/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { Link, Outlet, createRoute } from '@tanstack/remix-router'
import { Route as RootRoute } from './__root'
import type { Handle } from '@remix-run/ui'

/**
 * Layer 1 of a four-deep layout chain. Each layer renders its own
 * heading, an optional sub-nav, and `<Outlet />` so the resulting DOM
 * makes nesting depth obvious. This route exercises:
 *
 *  - `<Outlet>` resolving `parentMatchId` at four depths simultaneously
 *  - `<MatchContext>` propagating the active matchId at each level
 *    (without the in-render fix, the inner Outlets returned null)
 *  - `subscribeDynamicStore` re-binding when leaf params change
 */
function AdminLayout(_handle: Handle) {
  return () => (
    <section style={{ borderLeft: '4px solid #ddd', paddingLeft: '1rem' }}>
      <h1>Admin</h1>
      <nav style={{ marginBottom: '0.5rem' }}>
        <Link to="/admin/users">All users</Link>
      </nav>
      <Outlet />
    </section>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/admin',
  component: AdminLayout,
})
