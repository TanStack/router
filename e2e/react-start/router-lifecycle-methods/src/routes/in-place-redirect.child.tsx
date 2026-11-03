import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { countClientRun } from '~/utils/origin'

// Child of /in-place-redirect: a codec loader whose wire value carries a
// marker. The parent redirects during hydration, so neither the raw wire value
// nor the hydrated value may ever render (the component must not mount).

const WIRE_PREFIX = 'TSR_E2E_IPR_WIRE:'

export const Route = createFileRoute('/in-place-redirect/child')({
  loader: {
    handler: () => ({ secret: 'child-plain-value' }),
    dehydrate: ({ data }) => ({ wire: `${WIRE_PREFIX}${data.secret}` }),
    hydrate: ({ data }) => {
      countClientRun('ipr-child-hydrate')
      return { secret: data.wire.slice(WIRE_PREFIX.length) }
    },
  },
  component: InPlaceRedirectChildComponent,
})

function InPlaceRedirectChildComponent() {
  const loaderData = Route.useLoaderData()
  React.useEffect(() => {
    countClientRun('ipr-child-mount')
  }, [])

  return (
    <div data-testid="ipr-child">
      <div data-testid="ipr-child-data">{JSON.stringify(loaderData)}</div>
    </div>
  )
}
