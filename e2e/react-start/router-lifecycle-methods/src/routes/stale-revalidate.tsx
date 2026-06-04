import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// ---------------------------------------------------------------------------
// Stale-time-triggered context revalidation test
//
// The route uses a short staleTime (200 ms) together with `revalidate: true`.
// Each time the context handler runs it records a timestamp and increments a
// global counter.
//
// Test strategy:
//   1. SSR page load → server values (runCount=1)
//   2. Client-navigate away, wait past staleTime, navigate back → handler
//      re-runs because the cached context is now stale (runCount increments).
// ---------------------------------------------------------------------------

let contextRunCount = 0

const getSource = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

export const Route = createFileRoute('/stale-revalidate')({
  // Short staleTime so the test can trigger a stale revalidation quickly.
  staleTime: 200,

  context: {
    handler: () => {
      contextRunCount++
      return {
        source: getSource(),
        runCount: contextRunCount,
        timestamp: Date.now(),
      }
    },
    revalidate: true,
    dehydrate: true,
  },

  beforeLoad: () => ({ srBeforeLoadCtx: 'stale-beforeLoad' }),
  loader: () => ({ srLoaderData: 'stale-loader' }),

  ssr: 'data-only',
  component: StaleRevalidateComponent,
})

function StaleRevalidateComponent() {
  const router = useRouter()
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="sr-component">
      <h1 data-testid="sr-heading">Stale Revalidate</h1>
      <div data-testid="sr-context-source">{context.source}</div>
      <div data-testid="sr-context-runCount">{String(context.runCount)}</div>
      <div data-testid="sr-context-timestamp">{String(context.timestamp)}</div>
      <div data-testid="sr-beforeLoad">{context.srBeforeLoadCtx}</div>
      <div data-testid="sr-loader">{loaderData.srLoaderData}</div>
      <button
        data-testid="sr-invalidate-btn"
        onClick={() => router.invalidate()}
      >
        Invalidate
      </button>
    </div>
  )
}
