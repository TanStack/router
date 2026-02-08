import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-sbf-context')
  .client(() => 'client-sbf-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-sbf-beforeLoad')
  .client(() => 'client-sbf-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-sbf-loader')
  .client(() => 'client-sbf-loader')

export const Route = createFileRoute('/serialize-beforeload-false')({
  // Only beforeLoad uses object form with serialize: false; rest use function form (defaults)
  context: () => ({ sbfContextCtx: getContext() }),
  beforeLoad: {
    handler: () => ({ sbfBeforeLoadCtx: getBeforeLoad() }),
    serialize: false,
  },
  loader: () => ({ sbfLoaderData: getLoader() }),
  // data-only SSR — beforeLoad re-executes on client
  ssr: 'data-only',
  component: SerializeBeforeloadFalseComponent,
})

function SerializeBeforeloadFalseComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="sbf-component">
      <h1 data-testid="sbf-heading">Serialize BeforeLoad False</h1>
      <div data-testid="sbf-context">{context.sbfContextCtx}</div>
      <div data-testid="sbf-beforeLoad">{context.sbfBeforeLoadCtx}</div>
      <div data-testid="sbf-loader">{loaderData.sbfLoaderData}</div>
    </div>
  )
}
