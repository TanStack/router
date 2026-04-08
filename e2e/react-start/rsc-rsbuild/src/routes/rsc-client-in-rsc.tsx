import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { getClientInRscServerComponent } from '~/utils/clientInRscServerComponent'
import { formatTimestamp } from '~/utils/formatTimestamp'

export const Route = createFileRoute('/rsc-client-in-rsc')({
  loader: async () => {
    const Server = await getClientInRscServerComponent({
      data: { title: 'Client-in-RSC Test' },
    })
    return {
      Server,
      loaderTimestamp: Date.now(),
    }
  },
  component: RscClientInRscComponent,
  pendingComponent: () => <>Loading...</>,
})

function RscClientInRscComponent() {
  const { Server, loaderTimestamp } = Route.useLoaderData()

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h1 data-testid="rsc-client-in-rsc-page-title">
        Client-in-RSC Test (Rsbuild)
      </h1>

      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
        <span data-testid="loader-timestamp" style={{ display: 'none' }}>
          {loaderTimestamp}
        </span>
        Route loaded at: {formatTimestamp(loaderTimestamp)}
      </div>

      <ClientOnly>
        <div data-testid="rsc-client-in-rsc-hydrated">hydrated</div>
      </ClientOnly>

      {Server}
    </div>
  )
}
