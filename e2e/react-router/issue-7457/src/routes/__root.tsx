import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  beforeLoad: async ({ context }) => {
    await context.queryClient.query({
      queryKey: ['issue-7457-root'],
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        return true
      },
      staleTime: 'static',
    })
  },
  component: RootComponent,
})

function RootComponent() {
  return (
    <main>
      <Outlet />
    </main>
  )
}
