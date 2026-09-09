import { Await, createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { Suspense } from 'solid-js'

const getQuickData = createServerFn({ method: 'GET' }).handler(() => {
  return {
    name: 'Quick data',
    timestamp: Date.now(),
    source: 'server' as const,
  }
})

function SlowComponent(props: { data: string; index: number }) {
  const startTime = Date.now()
  while (Date.now() - startTime < 100) {
    // Simulate slow render work.
  }
  return <div data-testid={`slow-component-${props.index}`}>{props.data}</div>
}

export const Route = createFileRoute('/slow-render')({
  loader: async () => {
    const quickData = await getQuickData()
    return {
      quickData,
      deferredData: new Promise<{ message: string; source: string }>((r) =>
        setTimeout(
          () =>
            r({
              message: 'Deferred resolved!',
              source: typeof window === 'undefined' ? 'server' : 'client',
            }),
          50,
        ),
      ),
      loaderSource: typeof window === 'undefined' ? 'server' : 'client',
    }
  },
  component: SlowRender,
})

function SlowRender() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Slow Render Test</h2>
      <p>Tests when render takes longer than serialization.</p>
      <div data-testid="quick-data">
        Quick: {data().quickData.name} @ {data().quickData.timestamp}
      </div>
      <div data-testid="quick-source">
        Quick data source: {data().quickData.source}
      </div>
      <div data-testid="loader-source">
        Loader source: {data().loaderSource}
      </div>
      <Suspense fallback={<div data-testid="deferred-loading">Loading...</div>}>
        <Await
          promise={data().deferredData}
          children={(value) => (
            <div data-testid="deferred-resolved">
              {value.message} (source: {value.source})
            </div>
          )}
        />
      </Suspense>
      <SlowComponent data="Slow component 1" index={1} />
      <SlowComponent data="Slow component 2" index={2} />
      <SlowComponent data="Slow component 3" index={3} />
    </div>
  )
}
