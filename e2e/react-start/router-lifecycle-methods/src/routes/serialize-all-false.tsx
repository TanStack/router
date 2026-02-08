import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const getContext = createIsomorphicFn()
  .server(() => 'server-saf-context')
  .client(() => 'client-saf-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-saf-beforeLoad')
  .client(() => 'client-saf-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-saf-loader')
  .client(() => 'client-saf-loader')

export const Route = createFileRoute('/serialize-all-false')({
  // All object form with serialize: false — nothing serialized, all re-executed on client
  context: {
    handler: () => ({ safContextCtx: getContext() }),
    serialize: false,
  },
  beforeLoad: {
    handler: () => ({ safBeforeLoadCtx: getBeforeLoad() }),
    serialize: false,
  },
  loader: {
    handler: () => ({ safLoaderData: getLoader() }),
    serialize: false,
  },
  // data-only SSR — client re-executes all methods, so server render would mismatch
  ssr: 'data-only',
  component: SerializeAllFalseComponent,
})

function SerializeAllFalseComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="saf-component">
      <h1 data-testid="saf-heading">Serialize All False</h1>
      <div data-testid="saf-context">{context.safContextCtx}</div>
      <div data-testid="saf-beforeLoad">{context.safBeforeLoadCtx}</div>
      <div data-testid="saf-loader">{loaderData.safLoaderData}</div>
    </div>
  )
}
