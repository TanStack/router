import { ErrorComponent, createFileRoute } from '@tanstack/react-router'
import axios from 'redaxios'
import { setResponseStatus } from 'vinxi/http'
import { createServerFn } from '@tanstack/start'
import type { ErrorComponentProps } from '@tanstack/react-router'
import type { User } from '~/utils/users'
import { NotFound } from '~/components/NotFound'

const fetchUser = createServerFn({ method: 'GET', static: true })
  .validator((d: string) => d)
  .handler(async ({ data: userId }) => {
    try {
      const res = await axios.get<User>(
        'https://jsonplaceholder.typicode.com/users/' + userId,
      )

      return {
        id: res.data.id,
        name: res.data.name,
        email: res.data.email,
      }
    } catch (e) {
      console.error(e)
      setResponseStatus(404)

      return { error: 'User not found' }
    }
  })

export const Route = createFileRoute('/users/$userId')({
  loader: async ({ params: { userId } }) => fetchUser({ data: userId }),
  errorComponent: UserErrorComponent,
  component: UserComponent,
  notFoundComponent: () => {
    return <NotFound>User not found</NotFound>
  },
})

export function UserErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}

function UserComponent() {
  const user = Route.useLoaderData()

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{user.name}</h4>
      <div className="text-sm">{user.email}</div>
    </div>
  )
}
