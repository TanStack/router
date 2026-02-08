import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-slf-context')
  .client(() => 'client-slf-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-slf-beforeLoad')
  .client(() => 'client-slf-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-slf-loader')
  .client(() => 'client-slf-loader')

export const Route = createFileRoute('/serialize-loader-false')({
  // Only loader uses object form with serialize: false; rest use function form (defaults)
  context: () => ({ slfContextCtx: getContext() }),
  beforeLoad: () => ({ slfBeforeLoadCtx: getBeforeLoad() }),
  loader: {
    handler: () => ({ slfLoaderData: getLoader() }),
    serialize: false,
  },
  // data-only SSR — loader re-executes on client
  ssr: 'data-only',
  component: SerializeLoaderFalseComponent,
})

function SerializeLoaderFalseComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="slf-component">
      <h1 data-testid="slf-heading">Serialize Loader False</h1>
      <div data-testid="slf-context">{context.slfContextCtx}</div>
      <div data-testid="slf-beforeLoad">{context.slfBeforeLoadCtx}</div>
      <div data-testid="slf-loader">{loaderData.slfLoaderData}</div>
    </div>
  )
}
