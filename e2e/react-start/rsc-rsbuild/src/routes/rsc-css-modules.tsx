import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { getCssModulesServerComponent } from '~/utils/cssModulesServerComponent'
import { formatTimestamp } from '~/utils/formatTimestamp'

export const Route = createFileRoute('/rsc-css-modules')({
  loader: async () => {
    const Server = await getCssModulesServerComponent({
      data: { title: 'CSS Modules in Server Components' },
    })
    return {
      Server,
      loaderTimestamp: Date.now(),
    }
  },
  component: RscCssModulesComponent,
  pendingComponent: () => <>Loading...</>,
})

function RscCssModulesComponent() {
  const { Server, loaderTimestamp } = Route.useLoaderData()

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h1 data-testid="rsc-css-modules-page-title">CSS Modules in RSC</h1>

      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
        <span data-testid="loader-timestamp" style={{ display: 'none' }}>
          {loaderTimestamp}
        </span>
        Route loaded at: {formatTimestamp(loaderTimestamp)}
      </div>

      <ClientOnly>
        <div data-testid="rsc-css-modules-hydrated">hydrated</div>
      </ClientOnly>

      {Server}
    </div>
  )
}
