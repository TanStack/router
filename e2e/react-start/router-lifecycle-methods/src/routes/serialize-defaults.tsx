import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// Each lifecycle method returns different values on server vs client.
// With function form (no explicit serialize), the effective behavior depends on
// the router-level defaultSerialize config (set via start.ts / VITE_SERIALIZE_DEFAULTS).
//
// Builtin defaults: beforeLoad=true, loader=true, context=false

const getContext = createIsomorphicFn()
  .server(() => 'server-sd-context')
  .client(() => 'client-sd-context')

const getBeforeLoad = createIsomorphicFn()
  .server(() => 'server-sd-beforeLoad')
  .client(() => 'client-sd-beforeLoad')

const getLoader = createIsomorphicFn()
  .server(() => 'server-sd-loader')
  .client(() => 'client-sd-loader')

export const Route = createFileRoute('/serialize-defaults')({
  // All function form — uses whatever defaults are in effect
  context: () => {
    return { sdContextCtx: getContext() }
  },
  beforeLoad: () => {
    return { sdBeforeLoadCtx: getBeforeLoad() }
  },
  loader: () => {
    return { sdLoaderData: getLoader() }
  },
  // Use data-only SSR because depending on defaultSerialize config,
  // some methods may re-execute on client producing different values.
  ssr: 'data-only',
  component: SerializeDefaultsComponent,
})

function SerializeDefaultsComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="sd-component">
      <h1 data-testid="sd-heading">Serialize Defaults</h1>
      <div data-testid="sd-context">{context.sdContextCtx}</div>
      <div data-testid="sd-beforeLoad">{context.sdBeforeLoadCtx}</div>
      <div data-testid="sd-loader">{loaderData.sdLoaderData}</div>
    </div>
  )
}
