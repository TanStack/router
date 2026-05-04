import {
  createRoute,
  Link,
  Outlet,
  subscribeMatch,
} from '@tanstack/remix-router'
import { Route as RootRoute } from './__root'
import type { Handle } from '@remix-run/ui'

interface User {
  id: number
  name: string
}

const SEED_USERS: Array<User> = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Bjarne' },
  { id: 3, name: 'Carmack' },
]

function UsersLayout(handle: Handle) {
  const match = subscribeMatch(handle, '/users')
  return () => {
    const users = (match()?.loaderData as Array<User> | undefined) ?? []
    return (
      <main>
        <h1>Users</h1>
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              <Link to="/users/$id" params={{ id: String(user.id) }}>
                {user.name}
              </Link>
            </li>
          ))}
        </ul>
        <hr />
        <Outlet />
      </main>
    )
  }
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/users',
  loader: async () => {
    // Replace with a real server function in a follow-up.
    return SEED_USERS
  },
  component: UsersLayout,
})
