'use client'

import * as React from 'react'

/**
 * A simple "use client" component with useState.
 * Used to test that client components work inside RSC streams.
 */
export function ClientCounter({ label }: { label: string }) {
  const [count, setCount] = React.useState(0)

  return (
    <div
      style={{
        backgroundColor: '#dcfce7',
        border: '2px solid #16a34a',
        borderRadius: '8px',
        padding: '16px',
        marginTop: '16px',
      }}
      data-testid="client-counter"
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
            backgroundColor: '#16a34a',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 'bold',
            letterSpacing: '0.5px',
          }}
          data-testid="client-counter-badge"
        >
          CLIENT COMPONENT
        </span>
      </div>
      <h3
        style={{ margin: '0 0 8px 0', color: '#14532d' }}
        data-testid="client-counter-label"
      >
        {label}
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => setCount((c) => c - 1)}
          data-testid="client-counter-decrement"
          style={{
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid #16a34a',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '16px',
          }}
        >
          -
        </button>
        <span
          style={{
            fontSize: '20px',
            fontWeight: 'bold',
            minWidth: '40px',
            textAlign: 'center',
          }}
          data-testid="client-counter-count"
        >
          {count}
        </span>
        <button
          onClick={() => setCount((c) => c + 1)}
          data-testid="client-counter-increment"
          style={{
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid #16a34a',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '16px',
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}
