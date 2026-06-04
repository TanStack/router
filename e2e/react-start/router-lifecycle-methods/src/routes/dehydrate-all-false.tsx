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
  // All object form with dehydrate: false — nothing dehydrated, all re-executed on client
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
  // data-only SSR — client re-executes all methods, so server render would mismatch
  ssr: 'data-only',
  component: DehydrateAllFalseComponent,
})

function DehydrateAllFalseComponent() {
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
