import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-dm-context')
  .client(() => 'client-dm-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-dm-beforeLoad')
  .client(() => 'client-dm-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-dm-loader')
  .client(() => 'client-dm-loader')

export const Route = createFileRoute('/dehydrate-mixed')({
  // Mixed: inverted from builtin defaults
  // context: dehydrate: true (builtin default is false)
  // beforeLoad: dehydrate: false (builtin default is true)
  // loader: dehydrate: true (matches builtin default)
  context: {
    handler: () => ({ dmContextCtx: getContext() }),
    dehydrate: true,
  },
  beforeLoad: {
    handler: () => ({ dmBeforeLoadCtx: getBeforeLoad() }),
    dehydrate: false,
  },
  loader: {
    handler: () => ({ dmLoaderData: getLoader() }),
    dehydrate: true,
  },
  // data-only SSR — beforeLoad re-executes on client
  ssr: 'data-only',
  component: DehydrateMixedComponent,
})

function DehydrateMixedComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="dm-component">
      <h1 data-testid="dm-heading">Dehydrate Mixed</h1>
      <div data-testid="dm-context">{context.dmContextCtx}</div>
      <div data-testid="dm-beforeLoad">{context.dmBeforeLoadCtx}</div>
      <div data-testid="dm-loader">{loaderData.dmLoaderData}</div>
    </div>
  )
}
