import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// Track how many times context handler has run (global counter).
// On server, this resets per request. On client, it persists.
let contextRunCount = 0

const getContextSource = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

export const Route = createFileRoute('/revalidate-context')({
  context: {
    handler: () => {
      contextRunCount++
      return {
        source: getContextSource(),
        runCount: contextRunCount,
      }
    },
    revalidate: true,
    dehydrate: true,
  },
  beforeLoad: () => ({ rcBeforeLoadCtx: 'revalidate-beforeLoad' }),
  loader: () => ({ rcLoaderData: 'revalidate-loader' }),
  ssr: 'data-only',
  component: RevalidateContextComponent,
})

function RevalidateContextComponent() {
  const router = useRouter()
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="rc-component">
      <h1 data-testid="rc-heading">Revalidate Context</h1>
      <div data-testid="rc-context-source">{context.source}</div>
      <div data-testid="rc-context-runCount">{String(context.runCount)}</div>
      <div data-testid="rc-beforeLoad">{context.rcBeforeLoadCtx}</div>
      <div data-testid="rc-loader">{loaderData.rcLoaderData}</div>
      <button
        data-testid="rc-invalidate-btn"
        onClick={() => router.invalidate()}
      >
        Invalidate
      </button>
    </div>
  )
}
