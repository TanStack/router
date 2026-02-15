import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-dat-context')
  .client(() => 'client-dat-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-dat-beforeLoad')
  .client(() => 'client-dat-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-dat-loader')
  .client(() => 'client-dat-loader')

export const Route = createFileRoute('/dehydrate-all-true')({
  // All object form with dehydrate: true — everything dehydrated from server
  context: {
    handler: () => ({ datContextCtx: getContext() }),
    dehydrate: true,
  },
  beforeLoad: {
    handler: () => ({ datBeforeLoadCtx: getBeforeLoad() }),
    dehydrate: true,
  },
  loader: {
    handler: () => ({ datLoaderData: getLoader() }),
    dehydrate: true,
  },
  ssr: 'data-only',
  component: DehydrateAllTrueComponent,
})

function DehydrateAllTrueComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="dat-component">
      <h1 data-testid="dat-heading">Dehydrate All True</h1>
      <div data-testid="dat-context">{context.datContextCtx}</div>
      <div data-testid="dat-beforeLoad">{context.datBeforeLoadCtx}</div>
      <div data-testid="dat-loader">{loaderData.datLoaderData}</div>
    </div>
  )
}
