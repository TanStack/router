import { queryOptions, useQuery } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'

// Child route with instant-resolving useQuery (no router-level loader).

const childQueryOptions = () =>
  queryOptions({
    queryKey: ['slow-layout-child-data'],
    queryFn: async () => {
      return 'child-resolved'
    },
  })

export const Route = createFileRoute('/slow-layout/child')({
  component: ChildComponent,
})

function ChildComponent() {
  const query = useQuery(childQueryOptions)

  return (
    <div data-testid="slow-layout-child-content">
      Child: {query.data ?? 'loading'}
    </div>
  )
}
