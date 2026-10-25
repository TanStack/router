import { createFileRoute } from '@tanstack/react-router'
import { getRouterInstance } from '@tanstack/react-start'
import { NotFound } from '../components/NotFound'
import { UserErrorComponent } from '../components/UserError'
import type { User } from '~/utils/users'

export const Route = createFileRoute('/users/$userId')({
  loader: async ({ params: { userId } }) => {
    try {
      const router = await getRouterInstance()
      const res = await fetch(new URL('/api/users/' + userId, router.origin))
      if (!res.ok) {
        throw new Error('Unexpected status code')
      }

      const data = await res.json()

      return data as User
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
      <div>
        <a
          href={`/api/users/${user.id}`}
          className="text-blue-800 hover:text-blue-600 underline"
        >
          View as JSON
        </a>
      </div>
    </div>
  )
}
