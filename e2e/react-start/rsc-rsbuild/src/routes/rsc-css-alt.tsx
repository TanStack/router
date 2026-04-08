import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { getAltCssServerComponent } from '~/utils/altCssServerComponent'
import { formatTimestamp } from '~/utils/formatTimestamp'

export const Route = createFileRoute('/rsc-css-alt')({
  loader: async () => {
    const Server = await getAltCssServerComponent({
      data: { heading: 'Alternate CSS Module Route' },
    })
    return {
      Server,
      loaderTimestamp: Date.now(),
    }
  },
  component: RscCssAltComponent,
  pendingComponent: () => <>Loading...</>,
})

function RscCssAltComponent() {
  const { Server, loaderTimestamp } = Route.useLoaderData()

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h1 data-testid="rsc-css-alt-page-title">Alternate CSS Module Route</h1>

      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
        <span data-testid="loader-timestamp" style={{ display: 'none' }}>
          {loaderTimestamp}
        </span>
        Route loaded at: {formatTimestamp(loaderTimestamp)}
      </div>

      <ClientOnly>
        <div data-testid="rsc-css-alt-hydrated">hydrated</div>
      </ClientOnly>

      {Server}
    </div>
  )
}
