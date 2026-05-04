/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  Link,
  Outlet,
  createRoute,
  useLoaderData,
  useParams,
} from '@tanstack/remix-router'
import { Route as AdminUsersRoute } from './admin.users'
import type { Handle } from '@remix-run/ui'

interface AdminUserDetail {
  id: number
  name: string
  sessions: Array<{ id: string; lastSeen: string }>
}

function AdminUserDetailLayout(handle: Handle) {
  const params = useParams(handle, { from: '/admin/users/$userId' })
  const readUser = useLoaderData(handle, { from: '/admin/users/$userId' })
  return () => {
    const id = params()?.userId ?? '?'
    const user = readUser() as AdminUserDetail | undefined
    return (
      <section style={{ borderLeft: '4px solid #aaa', paddingLeft: '1rem' }}>
        <h3>
          User #{id} <small>({user?.name ?? '…'})</small>
        </h3>
        <p>Sessions:</p>
        <ul>
          {(user?.sessions ?? []).map((s) => (
            <li key={s.id}>
              <Link
                to="/admin/users/$userId/sessions/$sessionId"
                params={{ userId: id, sessionId: s.id }}
              >
                {s.id} — last seen {s.lastSeen}
              </Link>
            </li>
          ))}
        </ul>
        <Outlet />
      </section>
    )
  }
}

export const Route = createRoute({
  getParentRoute: () => AdminUsersRoute,
  path: '$userId',
  loader: ({ params }: { params: { userId: string } }) => {
    const id = Number(params.userId)
    return {
      id,
      name: `Operator #${id}`,
      sessions: [
        { id: `s${id}-a`, lastSeen: '5m ago' },
        { id: `s${id}-b`, lastSeen: '2h ago' },
      ],
    } satisfies AdminUserDetail
  },
  component: AdminUserDetailLayout,
})
