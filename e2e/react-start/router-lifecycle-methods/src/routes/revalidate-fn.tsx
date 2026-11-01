import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { countClientRun, getOrigin } from '~/utils/origin'

// Refresh part of a context, keep the rest stable.
// `revalidate` receives `prev` and keeps `stableToken` while refreshing
// `authStatus`. The context is transported (`dehydrate: true`), so after SSR
// the first `prev` is the value restored from the payload.

let clientStableCounter = 0
const nextStableToken = createIsomorphicFn()
  .server(() => 'stable-server')
  .client(() => `stable-client-${++clientStableCounter}`)

export const Route = createFileRoute('/revalidate-fn')({
  context: {
    handler: () => ({
      origin: getOrigin(),
      stableToken: nextStableToken(),
      authStatus: 1,
      revalidateRuns: 0,
    }),
    dehydrate: true,
    revalidate: ({ prev }) => ({
      origin: getOrigin(),
      stableToken: prev?.stableToken ?? nextStableToken(),
      authStatus: (prev?.authStatus ?? 0) + 1,
      revalidateRuns: countClientRun('revalidate'),
    }),
  },
  beforeLoad: () => ({ revalidateBeforeLoadCtx: 'revalidate-beforeLoad' }),
  loader: () => ({ revalidateLoaderData: 'revalidate-loader' }),
  ssr: 'data-only',
  component: RevalidateFnComponent,
})

function RevalidateFnComponent() {
  const router = useRouter()
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="revalidate-component">
      <h1 data-testid="revalidate-heading">Revalidate fn</h1>
      <div data-testid="revalidate-origin">{context.origin}</div>
      <div data-testid="revalidate-stable-token">{context.stableToken}</div>
      <div data-testid="revalidate-auth-status">
        {String(context.authStatus)}
      </div>
      <div data-testid="revalidate-runs">{String(context.revalidateRuns)}</div>
      <div data-testid="revalidate-beforeLoad">
        {context.revalidateBeforeLoadCtx}
      </div>
      <div data-testid="revalidate-loader">
        {loaderData.revalidateLoaderData}
      </div>
      <button
        data-testid="revalidate-invalidate-btn"
        onClick={() => router.invalidate()}
      >
        Invalidate
      </button>
    </div>
  )
}
