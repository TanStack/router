import { createQuery } from '@tanstack/solid-query'
import { ErrorComponent, createFileRoute } from '@tanstack/solid-router'
import type { ErrorComponentProps } from '@tanstack/solid-router'
import { NotFound } from '~/components/NotFound'
import { userQueryOptions } from '~/utils/users'

export const Route = createFileRoute('/users/$userId')({
  loader: async ({ context, params: { userId } }) => {
    await context.queryClient.ensureQueryData(userQueryOptions(userId))
  },
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
  const params = Route.useParams()
  const userQuery = createQuery(() => userQueryOptions(params().userId))
  const user = userQuery.data

  return (
    <div class="space-y-2">
      <h4 class="text-xl font-bold underline">{user?.name}</h4>
      <div class="text-sm">{user?.email}</div>
    </div>
  )
}
