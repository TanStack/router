import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-daf-context')
  .client(() => 'client-daf-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-daf-beforeLoad')
  .client(() => 'client-daf-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-daf-loader')
  .client(() => 'client-daf-loader')

export const Route = createFileRoute('/dehydrate-all-false')({
  // All object form with dehydrate: false: nothing transported, everything re-run on the client during hydration.
  context: {
    handler: () => ({ dafContextCtx: getContext() }),
    dehydrate: false,
  },
  beforeLoad: {
    handler: () => ({ dafBeforeLoadCtx: getBeforeLoad() }),
    dehydrate: false,
  },
  loader: {
    handler: () => ({ dafLoaderData: getLoader() }),
    dehydrate: false,
  },
  // data-only SSR: a lifecycle that is not transported re-runs on the client
  // and produces a different value, which an SSR-rendered component would
  // mismatch on.
  ssr: 'data-only',
  component: RouteComponent,
})

function RouteComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="daf-component">
      <h1 data-testid="daf-heading">Dehydrate All False</h1>
      <div data-testid="daf-context">{context.dafContextCtx}</div>
      <div data-testid="daf-beforeLoad">{context.dafBeforeLoadCtx}</div>
      <div data-testid="daf-loader">{loaderData.dafLoaderData}</div>
    </div>
  )
}
