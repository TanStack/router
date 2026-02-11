import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-dbf-context')
  .client(() => 'client-dbf-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-dbf-beforeLoad')
  .client(() => 'client-dbf-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-dbf-loader')
  .client(() => 'client-dbf-loader')

export const Route = createFileRoute('/dehydrate-beforeload-false')({
  // Only beforeLoad uses object form with dehydrate: false; rest use function form (defaults)
  context: () => ({ dbfContextCtx: getContext() }),
  beforeLoad: {
    handler: () => ({ dbfBeforeLoadCtx: getBeforeLoad() }),
    dehydrate: false,
  },
  loader: () => ({ dbfLoaderData: getLoader() }),
  // data-only SSR — beforeLoad re-executes on client
  ssr: 'data-only',
  component: DehydrateBeforeloadFalseComponent,
})

function DehydrateBeforeloadFalseComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="dbf-component">
      <h1 data-testid="dbf-heading">Dehydrate BeforeLoad False</h1>
      <div data-testid="dbf-context">{context.dbfContextCtx}</div>
      <div data-testid="dbf-beforeLoad">{context.dbfBeforeLoadCtx}</div>
      <div data-testid="dbf-loader">{loaderData.dbfLoaderData}</div>
    </div>
  )
}
