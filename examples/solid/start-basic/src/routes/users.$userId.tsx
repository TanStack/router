import axios from 'redaxios'
import { NotFound } from 'src/components/NotFound'
import { UserErrorComponent } from 'src/components/UserError'
import { json } from '@tanstack/solid-start'
import type { User } from 'src/utils/users'

export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ params, request }) => {
    console.info(`Fetching users by id=${params.userId}... @`, request.url)
    try {
      const res = await axios.get<User>(
        'https://jsonplaceholder.typicode.com/users/' + params.userId,
      )

      return json({
        id: res.data.id,
        name: res.data.name,
        email: res.data.email,
      })
    } catch (e) {
      console.error(e)
      return json({ error: 'User not found' }, { status: 404 })
    }
  },
})

export const Route = createFileRoute({
  loader: async ({ params: { userId } }) => {
    return (await axios.get)<typeof ServerRoute.get.return>(
      '/api/users/' + userId,
    )
      .then((r) => r.data)
      .catch(() => {
        throw new Error('Failed to fetch user')
      })
  },
  errorComponent: UserErrorComponent,
  component: UserComponent,
  notFoundComponent: () => {
    return <NotFound>User not found</NotFound>
  },
})

function UserComponent() {
  const user = Route.useLoaderData()

  return (
    <div class="space-y-2">
      <h4 class="text-xl font-bold underline">{user().name}</h4>
      <div class="text-sm">{user().email}</div>
    </div>
  )
}
