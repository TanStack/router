import { createFileRoute } from '@tanstack/react-router'
import { countClientRun } from '~/utils/origin'

// Guard-only beforeLoad under the presence protocol: the handler
// returns nothing, the server still transports the (undefined) result as a
// `b: void 0` key, and the client restores it by presence instead of
// re-running the guard during hydration. On client navigations the guard runs
// per load as always. `countClientRun` counts the browser runs.

export const Route = createFileRoute('/void-guard')({
  beforeLoad: () => {
    countClientRun('vg-beforeLoad')
    // guard-only: nothing to return
  },
  loader: () => ({ vgLoader: 'vg-loader' }),
  component: VoidGuardComponent,
})

function VoidGuardComponent() {
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="vg-component">
      <h1 data-testid="vg-heading">Void guard</h1>
      <div data-testid="vg-loader">{loaderData.vgLoader}</div>
    </div>
  )
}
