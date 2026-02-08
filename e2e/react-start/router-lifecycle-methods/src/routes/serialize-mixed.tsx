import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-sm-context')
  .client(() => 'client-sm-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-sm-beforeLoad')
  .client(() => 'client-sm-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-sm-loader')
  .client(() => 'client-sm-loader')

export const Route = createFileRoute('/serialize-mixed')({
  // Mixed: inverted from builtin defaults
  // context: serialize: true (builtin default is false)
  // beforeLoad: serialize: false (builtin default is true)
  // loader: serialize: true (matches builtin default)
  context: {
    handler: () => ({ smContextCtx: getContext() }),
    serialize: true,
  },
  beforeLoad: {
    handler: () => ({ smBeforeLoadCtx: getBeforeLoad() }),
    serialize: false,
  },
  loader: {
    handler: () => ({ smLoaderData: getLoader() }),
    serialize: true,
  },
  // data-only SSR — beforeLoad re-executes on client
  ssr: 'data-only',
  component: SerializeMixedComponent,
})

function SerializeMixedComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="sm-component">
      <h1 data-testid="sm-heading">Serialize Mixed</h1>
      <div data-testid="sm-context">{context.smContextCtx}</div>
      <div data-testid="sm-beforeLoad">{context.smBeforeLoadCtx}</div>
      <div data-testid="sm-loader">{loaderData.smLoaderData}</div>
    </div>
  )
}
