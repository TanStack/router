import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { useState } from 'react'

// This route deliberately keeps BOTH a `createServerFn` loader and the route
// component in the same file. That combination is the regression under test:
// the server-fn extraction (`?tss-serverfn-split`) must not strip the route
// component's client Fast Refresh boundary (`?tsr-split=component`).
const getHmrServerComponent = createServerFn({ method: 'GET' }).handler(
  async () => {
    return renderServerComponent(
      <div data-testid="rsc-hmr-server-content">server-rendered content</div>,
    )
  },
)

export const Route = createFileRoute('/rsc-hmr-serverfn')({
  loader: () => getHmrServerComponent(),
  component: RscHmrServerFnComponent,
})

function RscHmrServerFnComponent() {
  const ServerComponent = Route.useLoaderData()
  const [count, setCount] = useState(0)

  return (
    <div>
      <h1 data-testid="rsc-hmr-marker">rsc-hmr-baseline</h1>
      <p data-testid="rsc-hmr-count">Count: {count}</p>
      <button
        type="button"
        data-testid="rsc-hmr-increment"
        onClick={() => setCount((value) => value + 1)}
      >
        Increment
      </button>
      {ServerComponent}
    </div>
  )
}
