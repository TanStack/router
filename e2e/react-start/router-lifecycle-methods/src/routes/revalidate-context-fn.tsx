import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// Separate counters so tests can verify whether revalidation came from
// the handler or the revalidate callback.
let handlerRunCount = 0
let revalidateRunCount = 0

const getContextSource = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

export const Route = createFileRoute('/revalidate-context-fn')({
  context: {
    handler: () => {
      handlerRunCount++
      return {
        source: getContextSource(),
        value: handlerRunCount,
        revalidated: false,
        revalidateRunCount,
      }
    },
    revalidate: ({ prev }) => {
      revalidateRunCount++
      return {
        source: getContextSource(),
        value: (prev?.value ?? 0) + 1,
        revalidated: true,
        revalidateRunCount,
      }
    },
    dehydrate: true,
  },
  beforeLoad: () => ({ rcfBeforeLoadCtx: 'revalidate-fn-beforeLoad' }),
  loader: () => ({ rcfLoaderData: 'revalidate-fn-loader' }),
  ssr: 'data-only',
  component: RevalidateContextFnComponent,
})

function RevalidateContextFnComponent() {
  const router = useRouter()
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="rcf-component">
      <h1 data-testid="rcf-heading">Revalidate Context Function</h1>
      <div data-testid="rcf-context-source">{context.source}</div>
      <div data-testid="rcf-context-value">{String(context.value)}</div>
      <div data-testid="rcf-context-revalidated">
        {String(context.revalidated)}
      </div>
      <div data-testid="rcf-context-revalidateRunCount">
        {String(context.revalidateRunCount)}
      </div>
      <div data-testid="rcf-beforeLoad">{context.rcfBeforeLoadCtx}</div>
      <div data-testid="rcf-loader">{loaderData.rcfLoaderData}</div>
      <button
        data-testid="rcf-invalidate-btn"
        onClick={() => router.invalidate()}
      >
        Invalidate
      </button>
    </div>
  )
}
