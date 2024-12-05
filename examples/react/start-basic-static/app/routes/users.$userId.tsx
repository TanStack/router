import { ErrorComponent, createFileRoute } from '@tanstack/react-router'
import axios from 'redaxios'
import { setResponseStatus } from 'vinxi/http'
import { createServerFn } from '@tanstack/start'
import type { ErrorComponentProps } from '@tanstack/react-router'
import type { User } from '~/utils/users'
import { NotFound } from '~/components/NotFound'

const fetchUser = createServerFn({ method: 'GET' })
  .validator((d: string) => d)
  .type(({ data }) => (+data % 2 === 0 ? 'static' : 'dynamic'))
  .handler(async ({ data: userId }) => {
    try {
      return axios
        .get<User>('https://jsonplaceholder.typicode.com/users/' + userId)
        .then((d) => ({
          id: d.data.id,
          name: d.data.name,
          email: d.data.email,
        }))
    } catch (e) {
      console.error(e)
      setResponseStatus(404)

      return { error: 'User not found' }
    }
  })

export const Route = createFileRoute('/users/$userId')({
  loader: ({ params: { userId } }) => fetchUser({ data: userId }),
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

  if ('error' in user) {
    return <NotFound>User not found</NotFound>
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{user.name}</h4>
      <div className="text-sm">{user.email}</div>
    </div>
  )
}
