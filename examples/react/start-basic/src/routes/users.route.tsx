import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { DEPLOY_URL } from '../utils/users'
import type { User } from '../utils/users'

export const Route = createFileRoute('/users')({
  loader: async () => {
    try {
      const res = await fetch(DEPLOY_URL + '/api/users')
      if (!res.ok) {
        throw new Error('Unexpected status code')
      }

      const data = (await res.json()) as Array<User>

      return data
    } catch {
      throw new Error('Failed to fetch users')
    }
  },
  component: UsersLayoutComponent,
})

function UsersLayoutComponent() {
  const users = Route.useLoaderData()

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {[
          ...users,
          { id: 'i-do-not-exist', name: 'Non-existent User', email: '' },
        ].map((user) => {
          return (
            <li key={user.id} className="whitespace-nowrap">
              <Link
                to="/users/$userId"
                params={{
                  userId: String(user.id),
                }}
                className="block py-1 text-blue-800 hover:text-blue-600"
                activeProps={{ className: 'text-black font-bold' }}
              >
                <div>{user.name}</div>
              </Link>
            </li>
          )
        })}
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
