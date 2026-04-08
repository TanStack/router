import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { formatTimestamp } from './formatTimestamp'

export const getBasicServerComponent = createServerFn({ method: 'GET' })
  .inputValidator((data: { label?: string }) => data)
  .handler(async ({ data }) => {
    const serverTimestamp = Date.now()

    const user = {
      name: 'Sarah Chen',
      role: 'Senior Software Engineer',
    }

    return renderServerComponent(
      <div
        style={{
          backgroundColor: '#e0f2fe',
          border: '2px solid #0284c7',
          borderRadius: '8px',
          padding: '16px',
        }}
        data-testid="rsc-basic-content"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              backgroundColor: '#0284c7',
              color: 'white',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 'bold',
              letterSpacing: '0.5px',
            }}
            data-testid="rsc-server-badge"
          >
            SERVER RENDERED
          </span>
          <span
            style={{
              fontSize: '11px',
              color: '#64748b',
              fontFamily: 'monospace',
            }}
            data-testid="rsc-server-timestamp"
          >
            Fetched: {formatTimestamp(serverTimestamp)}
          </span>
        </div>

        <h2
          style={{ margin: '0 0 4px 0', color: '#0c4a6e' }}
          data-testid="rsc-label"
        >
          {user.name}
        </h2>
        <div style={{ color: '#0369a1' }}>{user.role}</div>

        {data?.label && (
          <div
            style={{ marginTop: '8px', fontSize: '13px', color: '#64748b' }}
            data-testid="rsc-custom-label"
          >
            Label: {data.label}
          </div>
        )}
      </div>,
    )
  })
