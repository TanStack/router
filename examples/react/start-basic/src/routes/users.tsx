import { Link, Outlet } from '@tanstack/react-router'
import axios from 'redaxios'
import { json } from '@tanstack/react-start'
import type { User } from '../utils/users'

export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ request }) => {
    console.info('Fetching users... @', request.url)
    const res = await axios.get<Array<User>>(
      'https://jsonplaceholder.typicode.com/users',
    )

    const list = res.data.slice(0, 10)

    return json(list.map((u) => ({ id: u.id, name: u.name, email: u.email })))
  },
})

export const Route = createFileRoute({
  loader: () => {
    return ServerRoute.methods.get().catch(() => {
      throw new Error('Failed to fetch users')
    })
  },
  component: UsersComponent,
})

function UsersComponent() {
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
