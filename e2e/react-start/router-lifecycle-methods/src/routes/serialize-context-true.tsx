import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-sct-context')
  .client(() => 'client-sct-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-sct-beforeLoad')
  .client(() => 'client-sct-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-sct-loader')
  .client(() => 'client-sct-loader')

export const Route = createFileRoute('/serialize-context-true')({
  // Only context uses object form with serialize: true; rest use function form (defaults)
  context: {
    handler: () => ({ sctContextCtx: getContext() }),
    serialize: true,
  },
  beforeLoad: () => ({ sctBeforeLoadCtx: getBeforeLoad() }),
  loader: () => ({ sctLoaderData: getLoader() }),
  // data-only SSR
  ssr: 'data-only',
  component: SerializeContextTrueComponent,
})

function SerializeContextTrueComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="sct-component">
      <h1 data-testid="sct-heading">Serialize Context True</h1>
      <div data-testid="sct-context">{context.sctContextCtx}</div>
      <div data-testid="sct-beforeLoad">{context.sctBeforeLoadCtx}</div>
      <div data-testid="sct-loader">{loaderData.sctLoaderData}</div>
    </div>
  )
}
