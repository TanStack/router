import { useQuery } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'
import { makeQueryOptions } from '~/queryOptions'

const qOptions = makeQueryOptions('useQuery')

export const Route = createFileRoute('/useQuery')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(qOptions)
  },
  component: RouteComponent,
})

function RouteComponent() {
  const query = useQuery(() => qOptions)
  return (
    <div>
      <div>
        query data: <div data-testid="query-data">{query.data ?? 'loading...'}</div>
      </div>
    </div>
  )
}