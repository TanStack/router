import * as React from 'react'
import { createServerFn } from '@tanstack/react-start'
import { createCompositeComponent } from '@tanstack/react-start/rsc'
import { serverBadge, serverBox, serverHeader, timestamp } from './serverStyles'
import { formatTimestamp } from './formatTimestamp'

export const getSlottedServerComponent = createServerFn({ method: 'GET' })
  .inputValidator((data: { title: string }) => data)
  .handler(async ({ data }) => {
    const serverTimestamp = Date.now()

    const metrics = {
      totalRevenue: 142580,
      activeUsers: 8432,
      conversionRate: 3.2,
    }

    return createCompositeComponent(
      (props: {
        children?: React.ReactNode
        renderFooter?: (data: { count: number }) => React.ReactNode
      }) => {
        return (
          <div style={serverBox} data-testid="rsc-slotted-content">
            <div style={serverHeader}>
              <span style={serverBadge}>SERVER LAYOUT</span>
              <span style={timestamp} data-testid="rsc-slotted-timestamp">
                Fetched: {formatTimestamp(serverTimestamp)}
              </span>
            </div>
            <h2
              style={{ margin: '0 0 16px 0', color: '#0c4a6e' }}
              data-testid="rsc-slotted-title"
            >
              {data.title}
            </h2>

            {/* Server-rendered metrics row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '6px',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  Revenue
                </div>
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#0284c7',
                  }}
                >
                  ${metrics.totalRevenue.toLocaleString()}
                </div>
              </div>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '6px',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  Users
                </div>
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#0284c7',
                  }}
                >
                  {metrics.activeUsers.toLocaleString()}
                </div>
              </div>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '6px',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  Conversion
                </div>
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#0284c7',
                  }}
                >
                  {metrics.conversionRate}%
                </div>
              </div>
            </div>

            {/* Client widgets slot */}
            <div
              style={{
                borderTop: '1px solid #bae6fd',
                paddingTop: '16px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#0369a1',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                Interactive Widgets (Client Slot)
              </div>
              <div data-testid="rsc-slotted-children">{props.children}</div>
            </div>

            {/* Footer render prop */}
            <div
              style={{ borderTop: '1px solid #bae6fd', paddingTop: '12px' }}
              data-testid="rsc-slotted-footer"
            >
              {props.renderFooter?.({ count: 42 })}
            </div>
          </div>
        )
      },
    )
  })
