/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createRoute, useParams } from '@tanstack/remix-router'
import { Route as AdminUserDetailRoute } from './admin.users.$userId'
import type { Handle } from '@remix-run/ui'

/**
 * Leaf at depth 4 — `__root → admin → admin/users → admin/users/$userId
 * → admin/users/$userId/sessions/$sessionId`. Reading the params object
 * here exercises `useParams` against the full path-params union; the
 * matchId-based reactivity sits four levels deep through reused
 * `<Outlet>` and `<MatchContext>` instances.
 */
function SessionDetail(handle: Handle) {
  const params = useParams(handle, {
    from: '/admin/users/$userId/sessions/$sessionId',
  })
  return () => {
    const p = params()
    return (
      <article style={{ borderLeft: '4px solid #888', paddingLeft: '1rem' }}>
        <h4>Session detail</h4>
        <p>
          User: <code>{p?.userId}</code>
        </p>
        <p>
          Session: <code>{p?.sessionId}</code>
        </p>
        <p>
          <em>(Synthetic data — params drive the entire view.)</em>
        </p>
      </article>
    )
  }
}

export const Route = createRoute({
  getParentRoute: () => AdminUserDetailRoute,
  path: 'sessions/$sessionId',
  component: SessionDetail,
})
