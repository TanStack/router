import { createFileRoute } from '@tanstack/solid-router'
import { z } from 'zod'
import { ssrSchema } from '~/search'

export const Route = createFileRoute('/mre-data-only')({
  validateSearch: z.object({ root: ssrSchema }),
  ssr: 'data-only',
  loader: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return { loadedAt: new Date().toISOString() }
  },
  pendingComponent: () => <div data-testid="mre-data-only-pending" />,
  component: MreDataOnlyRoute,
})

function MreDataOnlyRoute() {
  const data = Route.useLoaderData()

  return (
    <div data-testid="mre-data-only-ready">
      <p data-testid="mre-data-only-ready-label">OK - loader finished</p>
      <pre data-testid="mre-data-only-ready-data">
        {JSON.stringify(data(), null, 2)}
      </pre>
    </div>
  )
}
