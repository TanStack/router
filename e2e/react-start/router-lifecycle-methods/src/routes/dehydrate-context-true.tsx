import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-dct-context')
  .client(() => 'client-dct-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-dct-beforeLoad')
  .client(() => 'client-dct-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-dct-loader')
  .client(() => 'client-dct-loader')

export const Route = createFileRoute('/dehydrate-context-true')({
  // Only context uses object form with dehydrate: true; rest use function form (defaults)
  context: {
    handler: () => ({ dctContextCtx: getContext() }),
    dehydrate: true,
  },
  beforeLoad: () => ({ dctBeforeLoadCtx: getBeforeLoad() }),
  loader: () => ({ dctLoaderData: getLoader() }),
  // data-only SSR
  ssr: 'data-only',
  component: DehydrateContextTrueComponent,
})

function DehydrateContextTrueComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="dct-component">
      <h1 data-testid="dct-heading">Dehydrate Context True</h1>
      <div data-testid="dct-context">{context.dctContextCtx}</div>
      <div data-testid="dct-beforeLoad">{context.dctBeforeLoadCtx}</div>
      <div data-testid="dct-loader">{loaderData.dctLoaderData}</div>
    </div>
  )
}
