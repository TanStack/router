import { createFileRoute } from '@tanstack/solid-router'
import { z } from 'zod'
import { ssrSchema } from '~/search'

export const Route = createFileRoute('/ssr-false-pending-component')({
  validateSearch: z.object({ root: ssrSchema }),
  ssr: false,
  loader: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return { loadedAt: new Date().toISOString() }
  },
  pendingComponent: () => (
    <div data-testid="ssr-false-pending-component-pending" />
  ),
  component: SsrFalsePendingComponentRoute,
})

function SsrFalsePendingComponentRoute() {
  const data = Route.useLoaderData()

  return (
    <div data-testid="ssr-false-pending-component-ready">
      <p data-testid="ssr-false-pending-component-ready-label">
        OK - loader finished
      </p>
      <pre data-testid="ssr-false-pending-component-ready-data">
        {JSON.stringify(data(), null, 2)}
      </pre>
    </div>
  )
}
