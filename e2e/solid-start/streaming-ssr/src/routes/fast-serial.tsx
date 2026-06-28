import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'

const getSmallData = createServerFn({ method: 'GET' }).handler(() => {
  return {
    value: 'small-data',
    timestamp: Date.now(),
    source: 'server' as const,
  }
})

export const Route = createFileRoute('/fast-serial')({
  loader: async () => {
    const data = await getSmallData()
    return {
      serverData: data,
      staticData: 'This is static data',
      timestamp: Date.now(),
      loaderSource: typeof window === 'undefined' ? 'server' : 'client',
    }
  },
  component: FastSerial,
})

function FastSerial() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Fast Serialization Test</h2>
      <p>This route tests when serialization completes before render.</p>
      <div data-testid="server-data">
        Server: {data().serverData.value} @ {data().serverData.timestamp}
      </div>
      <div data-testid="server-fn-source">
        Server function source: {data().serverData.source}
      </div>
      <div data-testid="loader-source">
        Loader source: {data().loaderSource}
      </div>
      <div data-testid="static-data">Static: {data().staticData}</div>
      <div data-testid="loader-timestamp">
        Loader timestamp: {data().timestamp}
      </div>
    </div>
  )
}
