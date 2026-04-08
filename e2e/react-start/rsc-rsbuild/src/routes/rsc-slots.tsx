import * as React from 'react'
import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { CompositeComponent } from '@tanstack/react-start/rsc'
import { clientStyles, pageStyles } from '~/utils/styles'
import { formatTimestamp } from '~/utils/formatTimestamp'
import { getSlottedServerComponent } from '~/utils/slotsServerComponent'

export const Route = createFileRoute('/rsc-slots')({
  loader: async () => {
    const Server = await getSlottedServerComponent({
      data: { title: 'Revenue Dashboard' },
    })
    return {
      Server,
      loaderTimestamp: Date.now(),
    }
  },
  component: RscSlotsComponent,
  pendingComponent: () => <>Loading...</>,
})

function RscSlotsComponent() {
  const { Server, loaderTimestamp } = Route.useLoaderData()
  const [childText, setChildText] = React.useState('initial child')
  const [footerMultiplier, setFooterMultiplier] = React.useState(1)
  const [showExtraChild, setShowExtraChild] = React.useState(false)

  return (
    <div style={pageStyles.container}>
      <h1 data-testid="rsc-slots-title" style={pageStyles.title}>
        Dashboard with Interactive Widgets
      </h1>

      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
        <span data-testid="loader-timestamp" style={{ display: 'none' }}>
          {loaderTimestamp}
        </span>
        Route loaded at: {formatTimestamp(loaderTimestamp)}
      </div>

      <ClientOnly>
        <div data-testid="rsc-slots-hydrated">hydrated</div>
      </ClientOnly>

      {/* Client Controls */}
      <div style={clientStyles.container} data-testid="controls">
        <div style={clientStyles.header}>
          <span style={clientStyles.badge}>CLIENT CONTROLS</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            data-testid="change-child-btn"
            onClick={() =>
              setChildText(`Widget updated at ${formatTimestamp(Date.now())}`)
            }
            style={{ ...clientStyles.button, ...clientStyles.primaryButton }}
          >
            Update Widget Text
          </button>
          <button
            data-testid="change-footer-btn"
            onClick={() => setFooterMultiplier((m) => m + 1)}
            style={{ ...clientStyles.button, ...clientStyles.secondaryButton }}
          >
            Increase Footer Value (x{footerMultiplier})
          </button>
          <button
            data-testid="toggle-extra-child-btn"
            onClick={() => setShowExtraChild((s) => !s)}
            style={{ ...clientStyles.button, ...clientStyles.secondaryButton }}
          >
            {showExtraChild ? 'Hide' : 'Show'} Extra Widget
          </button>
        </div>
      </div>

      <CompositeComponent
        src={Server}
        renderFooter={({ count }: { count: number }) => (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#64748b', fontSize: '13px' }}>
              Server provided count: {count}
            </span>
            <span
              data-testid="footer-content"
              style={{
                padding: '4px 12px',
                backgroundColor: '#dcfce7',
                border: '1px solid #16a34a',
                borderRadius: '4px',
                color: '#166534',
                fontWeight: 'bold',
              }}
            >
              Computed: {count * footerMultiplier}
            </span>
          </div>
        )}
      >
        {/* Client widgets rendered inside server slot */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              flex: '1',
              minWidth: '150px',
              padding: '12px',
              backgroundColor: '#dcfce7',
              border: '1px solid #16a34a',
              borderRadius: '6px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#166534',
                marginBottom: '4px',
              }}
            >
              CLIENT WIDGET
            </div>
            <span data-testid="child-content" style={{ color: '#14532d' }}>
              {childText}
            </span>
          </div>
          {showExtraChild && (
            <div
              style={{
                flex: '1',
                minWidth: '150px',
                padding: '12px',
                backgroundColor: '#dcfce7',
                border: '1px solid #16a34a',
                borderRadius: '6px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#166534',
                  marginBottom: '4px',
                }}
              >
                EXTRA WIDGET
              </div>
              <span
                data-testid="extra-child-content"
                style={{ color: '#14532d' }}
              >
                Extra widget visible!
              </span>
            </div>
          )}
        </div>
      </CompositeComponent>
    </div>
  )
}
