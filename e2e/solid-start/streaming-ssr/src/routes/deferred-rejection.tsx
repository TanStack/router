import { Await, createFileRoute } from '@tanstack/solid-router'
import { Suspense } from 'solid-js'

const deferredErrorMessage = 'Error in deferred object'

export const Route = createFileRoute('/deferred-rejection')({
  loader: async () => {
    return {
      deferredData: new Promise<string>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(deferredErrorMessage))
        }, 1000)
      }),
    }
  },
  errorComponent: ({ error }) => (
    <div data-testid="deferred-error-boundary">{error.message}</div>
  ),
  component: DeferredRejection,
})

function DeferredRejection() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Deferred Rejection Test</h2>
      <Suspense
        fallback={<div data-testid="deferred-loading">Loading deferred...</div>}
      >
        <Await
          promise={data().deferredData}
          children={(value) => <div data-testid="deferred-data">{value}</div>}
        />
      </Suspense>
    </div>
  )
}
