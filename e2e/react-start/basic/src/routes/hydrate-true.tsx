import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/hydrate-true')({
  loader: () => ({
    message: 'hydrate true route rendered',
  }),
  component: HydrateTrueComponent,
})

function HydrateTrueComponent() {
  const data = Route.useLoaderData()
  const [count, setCount] = React.useState(0)

  return (
    <main>
      <h1 data-testid="hydrate-true-heading">Hydrate true route</h1>
      <p data-testid="hydrate-true-message">{data.message}</p>
      <p data-testid="hydrate-true-count">{count}</p>
      <button
        data-testid="hydrate-true-increment"
        onClick={() => setCount((d) => d + 1)}
      >
        Increment
      </button>
    </main>
  )
}
