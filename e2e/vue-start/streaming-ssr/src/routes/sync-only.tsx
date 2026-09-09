import { createFileRoute } from '@tanstack/vue-router'

export const Route = createFileRoute('/sync-only')({
  loader: async () => {
    return {
      message: 'Hello from sync loader!',
      timestamp: Date.now(),
      items: ['item-1', 'item-2', 'item-3'],
      source: typeof window === 'undefined' ? 'server' : 'client',
    }
  },
  component: SyncOnly,
})

function SyncOnly() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h1 data-testid="sync-title">Synchronous Serialization Test</h1>
      <p data-testid="sync-message">{data.value.message}</p>
      <p data-testid="sync-timestamp">Loaded at: {data.value.timestamp}</p>
      <p data-testid="sync-source">Source: {data.value.source}</p>
      <ul data-testid="sync-items">
        {data.value.items.map((item) => (
          <li data-testid={`sync-item-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
