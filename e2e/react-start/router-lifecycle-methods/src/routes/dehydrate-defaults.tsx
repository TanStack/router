import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// Each lifecycle method returns different values on server vs client.
// With function form (no explicit dehydrate), the effective behavior depends on
// the router-level defaultDehydrate config (set via start.ts / VITE_DEHYDRATE_DEFAULTS).
//
// Builtin defaults: beforeLoad=true, loader=true, context=false

const getContext = createIsomorphicFn()
  .server(() => 'server-dd-context')
  .client(() => 'client-dd-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-dd-beforeLoad')
  .client(() => 'client-dd-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-dd-loader')
  .client(() => 'client-dd-loader')

export const Route = createFileRoute('/dehydrate-defaults')({
  // All function form — uses whatever defaults are in effect
  context: () => {
    return { ddContextCtx: getContext() }
  },
  beforeLoad: () => {
    return { ddBeforeLoadCtx: getBeforeLoad() }
  },
  loader: () => {
    return { ddLoaderData: getLoader() }
  },
  // Use data-only SSR because depending on defaultDehydrate config,
  // some methods may re-execute on client producing different values.
  ssr: 'data-only',
  component: DehydrateDefaultsComponent,
})

function DehydrateDefaultsComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="dd-component">
      <h1 data-testid="dd-heading">Dehydrate Defaults</h1>
      <div data-testid="dd-context">{context.ddContextCtx}</div>
      <div data-testid="dd-beforeLoad">{context.ddBeforeLoadCtx}</div>
      <div data-testid="dd-loader">{loaderData.ddLoaderData}</div>
    </div>
  )
}
