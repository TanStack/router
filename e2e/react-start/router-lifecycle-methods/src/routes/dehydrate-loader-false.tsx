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
  // Only loader uses object form with dehydrate: false; rest use function form (defaults)
  context: () => ({ dlfContextCtx: getContext() }),
  beforeLoad: () => ({ dlfBeforeLoadCtx: getBeforeLoad() }),
  loader: {
    handler: () => ({ dlfLoaderData: getLoader() }),
    dehydrate: false,
  },
  // data-only SSR — loader re-executes on client
  ssr: 'data-only',
  component: DehydrateLoaderFalseComponent,
})

function DehydrateLoaderFalseComponent() {
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
