import { createFileRoute } from '@tanstack/react-router'
import { countClientRun, getOrigin } from '~/utils/origin'

// In-place re-run of a non-transported loader on a data-only route: the
// server runs the loader, sends nothing for it, and the client runs it exactly
// once during hydration (no second client load afterwards).

export const Route = createFileRoute('/in-place-loader')({
  ssr: 'data-only',
  context: () => ({ iplContextCtx: 'ipl-context' }),
  beforeLoad: () => ({ iplBeforeLoadCtx: 'ipl-beforeLoad' }),
  loader: {
    handler: () => ({
      origin: getOrigin(),
      clientRuns: countClientRun('ipl-loader'),
    }),
    dehydrate: false,
  },
  component: InPlaceLoaderComponent,
})

function InPlaceLoaderComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="ipl-component">
      <h1 data-testid="ipl-heading">In-place loader</h1>
      <div data-testid="ipl-context">{context.iplContextCtx}</div>
      <div data-testid="ipl-beforeLoad">{context.iplBeforeLoadCtx}</div>
      <div data-testid="ipl-loader-origin">{loaderData.origin}</div>
      <div data-testid="ipl-loader-client-runs">
        {String(loaderData.clientRuns)}
      </div>
    </div>
  )
}
