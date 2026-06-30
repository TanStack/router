import { Await, createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'
import { Suspense } from 'vue'

const getImmediateData = createServerFn({ method: 'GET' })
  .validator((data: { name: string }) => data)
  .handler(({ data }) => {
    return {
      name: data.name,
      timestamp: Date.now(),
      source: 'server' as const,
    }
  })

const getSlowData = createServerFn({ method: 'GET' })
  .validator((data: { name: string; delay: number }) => data)
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, data.delay))
    return {
      name: data.name,
      timestamp: Date.now(),
      source: 'server' as const,
    }
  })

export const Route = createFileRoute('/deferred')({
  loader: async () => {
    return {
      deferredData: new Promise<{ message: string; source: string }>((r) =>
        setTimeout(
          () =>
            r({
              message: 'Deferred data loaded!',
              source: typeof window === 'undefined' ? 'server' : 'client',
            }),
          1000,
        ),
      ),
      deferredServerData: getSlowData({
        data: { name: 'Slow User', delay: 800 },
      }),
      immediateData: await getImmediateData({ data: { name: 'Fast User' } }),
      loaderSource: typeof window === 'undefined' ? 'server' : 'client',
    }
  },
  component: Deferred,
})

function Deferred() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Deferred Data Test</h2>
      <div data-testid="immediate-data">
        Immediate: {data.value.immediateData.name} @{' '}
        {data.value.immediateData.timestamp}
      </div>
      <div data-testid="immediate-source">
        Immediate source: {data.value.immediateData.source}
      </div>
      <div data-testid="loader-source">
        Loader source: {data.value.loaderSource}
      </div>
      <Suspense>
        {{
          default: () => (
            <Await
              promise={data.value.deferredData}
              children={(value: { message: string; source: string }) => (
                <div data-testid="deferred-data">
                  {value.message} (source: {value.source})
                </div>
              )}
            />
          ),
          fallback: () => (
            <div data-testid="deferred-loading">Loading deferred...</div>
          ),
        }}
      </Suspense>
      <Suspense>
        {{
          default: () => (
            <Await
              promise={data.value.deferredServerData}
              children={(value: {
                name: string
                timestamp: number
                source: string
              }) => (
                <div data-testid="deferred-server-data">
                  Server: {value.name} @ {value.timestamp} (source:{' '}
                  {value.source})
                </div>
              )}
            />
          ),
          fallback: () => (
            <div data-testid="server-loading">Loading server data...</div>
          ),
        }}
      </Suspense>
    </div>
  )
}
