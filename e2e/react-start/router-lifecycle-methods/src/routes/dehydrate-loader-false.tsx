import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-dlf-context')
  .client(() => 'client-dlf-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-dlf-beforeLoad')
  .client(() => 'client-dlf-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-dlf-loader')
  .client(() => 'client-dlf-loader')

export const Route = createFileRoute('/dehydrate-loader-false')({
  // Only loader opts out of transport; context and beforeLoad keep their defaults.
  context: () => ({ dlfContextCtx: getContext() }),
  beforeLoad: () => ({ dlfBeforeLoadCtx: getBeforeLoad() }),
  loader: {
    handler: () => ({ dlfLoaderData: getLoader() }),
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
    <div data-testid="dlf-component">
      <h1 data-testid="dlf-heading">Dehydrate Loader False</h1>
      <div data-testid="dlf-context">{context.dlfContextCtx}</div>
      <div data-testid="dlf-beforeLoad">{context.dlfBeforeLoadCtx}</div>
      <div data-testid="dlf-loader">{loaderData.dlfLoaderData}</div>
    </div>
  )
}
