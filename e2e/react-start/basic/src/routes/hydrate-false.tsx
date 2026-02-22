import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/hydrate-false')({
  hydrate: false,
  loader: () => ({
    message: 'hydrate false route rendered on server',
    serverTime: new Date().toISOString(),
  }),
  head: () => ({
    meta: [
      {
        title: 'Hydrate False Route',
      },
      {
        name: 'description',
        content: 'hydrate false e2e route',
      },
    ],
    scripts: [
      {
        children: 'window.HYDRATE_FALSE_INLINE_SCRIPT = true',
      },
    ],
  }),
  component: HydrateFalseComponent,
})

function HydrateFalseComponent() {
  const data = Route.useLoaderData()

  return (
    <main>
      <h1 data-testid="hydrate-false-heading">Hydrate false route</h1>
      <p data-testid="hydrate-false-message">{data.message}</p>
      <p data-testid="hydrate-false-server-time">{data.serverTime}</p>
      <button data-testid="hydrate-false-button" onClick={() => undefined}>
        Non-interactive button
      </button>
    </main>
  )
}
