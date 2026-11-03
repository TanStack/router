import { createFileRoute } from '@tanstack/react-router'
import { countClientRun } from '~/utils/origin'

// A throwing `hydrate` makes that match the pending boundary
// of the client load that follows hydration, which re-runs the handler. The
// handler returns the transported value, so `countClientRun` tells its
// client run apart from a presented wire value.

export const Route = createFileRoute('/codec-error-hydrate-throws')({
  ssr: 'data-only',
  beforeLoad: {
    handler: () => {
      countClientRun('ceht-beforeLoad')
      return { guard: 'ok' }
    },
    dehydrate: true,
    hydrate: ({ data }) => {
      if (data.guard) throw new Error('TSR_E2E_HYDRATE_THROW')
      return data
    },
  },
  component: () => (
    <div data-testid="ceht-component">
      <h1 data-testid="ceht-heading">hydrate throws</h1>
      <div data-testid="ceht-guard">{Route.useRouteContext().guard}</div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div data-testid="ceht-error-component">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ),
})
