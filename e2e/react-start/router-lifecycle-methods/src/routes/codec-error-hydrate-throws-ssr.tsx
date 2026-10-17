import { createFileRoute } from '@tanstack/react-router'
import { countClientRun } from '~/utils/origin'

// A throwing `hydrate` on an `ssr: true` route: the server rendered the
// component from the handler's value and transported it; `hydrate` throws
// during hydration, and the client load that follows re-runs the handler. The
// handler returns the server's value, so `countClientRun` tells its client
// run apart from a presented wire value.

export const Route = createFileRoute('/codec-error-hydrate-throws-ssr')({
  loader: {
    handler: () => {
      countClientRun('cehts-loader')
      return { value: 'ssr-loader-value' }
    },
    dehydrate: true,
    hydrate: ({ data }) => {
      if (data.value) throw new Error('TSR_E2E_HYDRATE_THROW_SSR')
      return data
    },
  },
  component: () => (
    <div data-testid="cehts-component">
      <h1 data-testid="cehts-heading">hydrate throws (ssr: true)</h1>
      <div data-testid="cehts-value">{Route.useLoaderData().value}</div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div data-testid="cehts-error-component">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ),
})
