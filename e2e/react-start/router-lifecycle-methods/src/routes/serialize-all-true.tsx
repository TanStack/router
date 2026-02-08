import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-sat-context')
  .client(() => 'client-sat-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-sat-beforeLoad')
  .client(() => 'client-sat-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-sat-loader')
  .client(() => 'client-sat-loader')

export const Route = createFileRoute('/serialize-all-true')({
  // All object form with serialize: true — everything serialized from server
  context: {
    handler: () => ({ satContextCtx: getContext() }),
    serialize: true,
  },
  beforeLoad: {
    handler: () => ({ satBeforeLoadCtx: getBeforeLoad() }),
    serialize: true,
  },
  loader: {
    handler: () => ({ satLoaderData: getLoader() }),
    serialize: true,
  },
  ssr: 'data-only',
  component: SerializeAllTrueComponent,
})

function SerializeAllTrueComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="sat-component">
      <h1 data-testid="sat-heading">Serialize All True</h1>
      <div data-testid="sat-context">{context.satContextCtx}</div>
      <div data-testid="sat-beforeLoad">{context.satBeforeLoadCtx}</div>
      <div data-testid="sat-loader">{loaderData.satLoaderData}</div>
    </div>
  )
}
