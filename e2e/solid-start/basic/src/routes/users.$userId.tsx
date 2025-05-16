import axios from 'redaxios'

import type { User } from '~/utils/users'
import { NotFound } from '~/components/NotFound'
import { UserErrorComponent } from '~/components/UserErrorComponent'

export const Route = createFileRoute({
  loader: async ({ params: { userId } }) => {
    return await axios
      .get<User>('/api/users/' + userId)
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
