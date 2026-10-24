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
  // Mixed: context true (default is false), beforeLoad false (default is true), loader true.
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
    <div data-testid="dm-component">
      <h1 data-testid="dm-heading">Dehydrate Mixed</h1>
      <div data-testid="dm-context">{context.dmContextCtx}</div>
      <div data-testid="dm-beforeLoad">{context.dmBeforeLoadCtx}</div>
      <div data-testid="dm-loader">{loaderData.dmLoaderData}</div>
    </div>
  )
}
