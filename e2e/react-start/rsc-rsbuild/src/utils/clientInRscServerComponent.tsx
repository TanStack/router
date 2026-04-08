import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ClientCounter } from './ClientCounter'
import { serverBadge, serverBox, serverHeader, timestamp } from './serverStyles'

export const getClientInRscServerComponent = createServerFn({ method: 'GET' })
  .inputValidator((data: { title: string }) => data)
  .handler(async ({ data }) => {
    const serverTimestamp = Date.now()

    return renderServerComponent(
      <div style={serverBox} data-testid="rsc-client-in-rsc-server">
        <div style={serverHeader}>
          <span style={serverBadge} data-testid="rsc-client-in-rsc-badge">
            SERVER COMPONENT
          </span>
          <span style={timestamp} data-testid="rsc-client-in-rsc-timestamp">
            Fetched: {new Date(serverTimestamp).toISOString()}
          </span>
        </div>

        <h2
          style={{ margin: '0 0 8px 0', color: '#0c4a6e' }}
          data-testid="rsc-client-in-rsc-title"
        >
          {data.title}
        </h2>

        <p style={{ margin: '0 0 8px 0', color: '#0369a1', fontSize: '14px' }}>
          This server component directly renders a client component with
          useState. The client component should hydrate and become interactive.
        </p>

        {/* Client component rendered directly inside server component */}
        <ClientCounter label="Interactive Counter" />
      </div>,
    )
  })
