import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/mre-data-only')({
  ssr: 'data-only',
  loader: async () => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    return { loadedAt: new Date().toISOString() }
  },
  pendingComponent: () => <div>PENDING</div>,
  component: MreDataOnlyRoute,
})

function MreDataOnlyRoute() {
  const data = Route.useLoaderData()

  return (
    <div data-testid="mre-data-only-ready">
      <p data-testid="mre-data-only-ready-label">OK — loader finished</p>
      <pre data-testid="mre-data-only-ready-data">
        {JSON.stringify(data(), null, 2)}
      </pre>
    </div>
  )
}
