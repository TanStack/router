import { Link, Outlet } from '@tanstack/solid-router'
import axios from 'redaxios'
import { json } from '@tanstack/solid-start'
import type { User } from '../utils/users'

export const ServerRoute = createServerFileRoute().methods((api) => ({
  GET: async ({ request }) => {
    console.info('Fetching users... @', request.url)
    const res = await axios.get<Array<User>>(
      'https://jsonplaceholder.typicode.com/users',
    )

    const list = res.data.slice(0, 10)

    return json(list.map((u) => ({ id: u.id, name: u.name, email: u.email })))
  },
  POST: api
    .validator((input: { body: { name: string; email: string } }) => input)
    .handler(async ({ data }) => {
      console.info('Creating user...', data)
      return json({ id: '1', name: data.body.name, email: data.body.email })
    }),
}))

export const Route = createFileRoute({
  loader: () => {
    return ServerRoute.client.get().catch(() => {
      throw new Error('Failed to fetch users')
    })
  },
  component: UsersComponent,
})

function UsersComponent() {
  const users = Route.useLoaderData()

  const addUser = (
    <button
      onClick={() => {
        ServerRoute.client.post({
          params: {
            userId: '1',
          },
          body: {
            name: 'John Doe',
            email: 'john.doe@example.com',
          },
        })
      }}
    >
      Add User
    </button>
  )

  return (
    <div class="p-2 flex gap-2">
      <ul class="list-disc pl-4">
        {[
          ...users(),
          { id: 'i-do-not-exist', name: 'Non-existent User', email: '' },
        ].map((user) => {
          return (
            <li class="whitespace-nowrap">
              <Link
                to="/users/$userId"
                params={{
                  userId: String(user.id),
                }}
                class="block py-1 text-blue-800 hover:text-blue-600"
                activeProps={{ class: 'text-black font-bold' }}
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
