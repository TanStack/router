import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-dd-context')
  .client(() => 'client-dd-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-dd-beforeLoad')
  .client(() => 'client-dd-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-dd-loader')
  .client(() => 'client-dd-loader')

export const Route = createFileRoute('/dehydrate-defaults')({
  // All function form: builtin transport defaults (context: false, beforeLoad: true, loader: true).
  context: () => ({ ddContextCtx: getContext() }),
  beforeLoad: () => ({ ddBeforeLoadCtx: getBeforeLoad() }),
  loader: () => ({ ddLoaderData: getLoader() }),
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
    <div data-testid="dd-component">
      <h1 data-testid="dd-heading">Dehydrate Defaults</h1>
      <div data-testid="dd-context">{context.ddContextCtx}</div>
      <div data-testid="dd-beforeLoad">{context.ddBeforeLoadCtx}</div>
      <div data-testid="dd-loader">{loaderData.ddLoaderData}</div>
    </div>
  )
}
