/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  Link,
  Outlet,
  createRoute,
  useLoaderData,
} from '@tanstack/remix-router'
import { Route as AdminRoute } from './admin'
import type { Handle } from '@remix-run/ui'

interface AdminUserStub {
  id: number
  name: string
}

const SEED: Array<AdminUserStub> = [
  { id: 100, name: 'Operator Alice' },
  { id: 101, name: 'Operator Bob' },
]

function AdminUsersLayout(handle: Handle) {
  const readUsers = useLoaderData(handle, { from: '/admin/users' })
  return () => {
    const users = (readUsers() as Array<AdminUserStub>) ?? []
    return (
      <section style={{ borderLeft: '4px solid #ccc', paddingLeft: '1rem' }}>
        <h2>Users (admin)</h2>
        <ul>
          {users.map((u) => (
            <li key={u.id}>
              <Link
                to="/admin/users/$userId"
                params={{ userId: String(u.id) }}
              >
                {u.name}
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
  getParentRoute: () => AdminRoute,
  path: 'users',
  loader: () => SEED,
  component: AdminUsersLayout,
})
