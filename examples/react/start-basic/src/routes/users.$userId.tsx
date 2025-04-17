import { NotFound } from 'src/components/NotFound'
import { UserErrorComponent } from 'src/components/UserError'
import { json } from '@tanstack/react-start'
import type { User } from 'src/utils/users'

export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ params, request }) => {
    console.info(`Fetching users by id=${params.userId}... @`, request.url)
    try {
      const res = await fetch(
        'https://jsonplaceholder.typicode.com/users/' + params.id,
      )
      if (!res.ok) {
        throw new Error('Failed to fetch user')
      }

      const user = (await res.json()) as User

      return json({
        id: user.id,
        name: user.name,
        email: user.email,
      })
    } catch (e) {
      console.error(e)
      return json({ error: 'User not found' }, { status: 404 })
    }
  },
})

export const Route = createFileRoute({
  loader: async ({ params: { userId } }) => {
    try {
      const res = await fetch('/api/users/' + userId)
      if (!res.ok) {
        throw new Error('Unexpected status code')
      }

      const data = (await res.json()) as typeof ServerRoute.methods.get.returns

      return data
    } catch {
      throw new Error('Failed to fetch user')
    }
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
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{user.name}</h4>
      <div className="text-sm">{user.email}</div>
    </div>
  )
}
