import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { countClientRun } from '~/utils/origin'

// In-place re-run on an `ssr: true` route: the server runs this beforeLoad
// but does not transport it (`dehydrate: false`); the client re-runs it in
// place during hydration while the match stays committed. The value is
// deterministic (same on both sides), so there is no hydration error and
// no pending flash: the component mounts once and the pendingComponent never
// renders.

const notePendingRender = createIsomorphicFn()
  .server(() => {})
  .client(() => {
    countClientRun('ipb-pending')
  })

const noteMount = createIsomorphicFn()
  .server(() => {})
  .client(() => {
    countClientRun('ipb-mount')
  })

export const Route = createFileRoute('/in-place-beforeload')({
  beforeLoad: {
    handler: () => {
      countClientRun('ipb-beforeLoad')
      return { ipbValue: 'deterministic-42' }
    },
    dehydrate: false,
  },
  loader: ({ context }) => ({ ipbLoader: `loader-${context.ipbValue}` }),
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: () => {
    notePendingRender()
    return <div data-testid="ipb-pending">pending</div>
  },
  component: InPlaceBeforeLoadComponent,
})

function InPlaceBeforeLoadComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()
  React.useEffect(() => {
    noteMount()
  }, [])

  return (
    <div data-testid="ipb-component">
      <h1 data-testid="ipb-heading">In-place beforeLoad</h1>
      <div data-testid="ipb-value">{context.ipbValue}</div>
      <div data-testid="ipb-loader">{loaderData.ipbLoader}</div>
    </div>
  )
}
