import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { getBasicServerComponent } from '~/utils/basicServerComponent'
import { formatTimestamp } from '~/utils/formatTimestamp'

export const Route = createFileRoute('/rsc-basic')({
  loader: async () => {
    const Server = await getBasicServerComponent({
      data: { label: 'test label' },
    })
    return {
      Server,
      loaderTimestamp: Date.now(),
    }
  },
  component: RscBasicComponent,
  pendingComponent: () => {
    return <>Loading...</>
  },
})

function RscBasicComponent() {
  const { Server, loaderTimestamp } = Route.useLoaderData()
  const [count, setCount] = useState(0)

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h1 data-testid="rsc-basic-title">RSC Basic (Rsbuild)</h1>

      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
        <span data-testid="loader-timestamp" style={{ display: 'none' }}>
          {loaderTimestamp}
        </span>
        Route loaded at: {formatTimestamp(loaderTimestamp)}
      </div>

      <ClientOnly>
        <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
          <div data-testid="rsc-basic-hydrated">hydrated</div>
          <div data-testid="rsc-basic-count">Count: {count}</div>
          <button
            data-testid="rsc-basic-increment"
            onClick={() => setCount((value) => value + 1)}
            type="button"
          >
            Increment
          </button>
          <input
            data-testid="rsc-basic-message"
            defaultValue=""
            placeholder="Route-local uncontrolled state"
            type="text"
          />
        </div>
      </ClientOnly>

      {Server}
    </div>
  )
}
