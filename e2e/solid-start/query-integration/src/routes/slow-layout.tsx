import { queryOptions, useQuery } from '@tanstack/solid-query'
import { Outlet, createFileRoute } from '@tanstack/solid-router'

// Parent layout with NO router-level loader.
// Data is loaded via component-level useQuery only (200ms delay).
// This triggers Solid Suspense via solid-query's internal createResource.

const slowLayoutQueryOptions = () =>
  queryOptions({
    queryKey: ['slow-layout-data'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 200))
      return 'slow-layout-resolved'
    },
  })

export const Route = createFileRoute('/slow-layout')({
  component: SlowLayoutComponent,
})

function SlowLayoutComponent() {
  const query = useQuery(slowLayoutQueryOptions)

  return (
    <div>
      <div data-testid="slow-layout-content">
        Layout: {query.data ?? 'loading'}
      </div>
      <Outlet />
    </div>
  )
}
