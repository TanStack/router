
import { createQuery } from '@tanstack/solid-query'
import { z } from 'zod'
import { userQueryOptions } from '../utils/queryOptions'

export const Route = createFileRoute({
  validateSearch: z.object({
    userId: z.number(),
  }),
  loaderDeps: ({ search: { userId } }) => ({ userId }),
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(
      userQueryOptions(opts.deps.userId),
    ),
  component: UserComponent,
})

function UserComponent() {
  const search = Route.useSearch()
  const userQuery = createQuery(()=>userQueryOptions(search().userId))
  const user = userQuery.data

  return (
    <>
      <h4 class="p-2 font-bold">{user?.name}</h4>
      <pre class="text-sm whitespace-pre-wrap">
        {JSON.stringify(user, null, 2)}
      </pre>
    </>
  )
}
