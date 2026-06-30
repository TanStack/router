import { createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'

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
        Server: {data.value.serverData.value} @{' '}
        {data.value.serverData.timestamp}
      </div>
      <div data-testid="server-fn-source">
        Server function source: {data.value.serverData.source}
      </div>
      <div data-testid="loader-source">
        Loader source: {data.value.loaderSource}
      </div>
      <div data-testid="static-data">Static: {data.value.staticData}</div>
      <div data-testid="loader-timestamp">
        Loader timestamp: {data.value.timestamp}
      </div>
    </div>
  )
}
