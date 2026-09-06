import { Await, createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { Suspense } from 'solid-js'

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
        Immediate: {data().immediateData.name} @{' '}
        {data().immediateData.timestamp}
      </div>
      <div data-testid="immediate-source">
        Immediate source: {data().immediateData.source}
      </div>
      <div data-testid="loader-source">
        Loader source: {data().loaderSource}
      </div>
      <Suspense
        fallback={<div data-testid="deferred-loading">Loading deferred...</div>}
      >
        <Await
          promise={data().deferredData}
          children={(value) => (
            <div data-testid="deferred-data">
              {value.message} (source: {value.source})
            </div>
          )}
        />
      </Suspense>
      <Suspense
        fallback={
          <div data-testid="server-loading">Loading server data...</div>
        }
      >
        <Await
          promise={data().deferredServerData}
          children={(value) => (
            <div data-testid="deferred-server-data">
              Server: {value.name} @ {value.timestamp} (source: {value.source})
            </div>
          )}
        />
      </Suspense>
    </div>
  )
}
