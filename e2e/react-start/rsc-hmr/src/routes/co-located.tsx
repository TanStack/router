import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { useState } from 'react'

// The server function is deliberately co-located with the route component in
// this file. That puts the file in the rsc module graph while the component
// below is still a genuine client module, which is the combination that used to
// lose client HMR entirely (see vitejs/vite-plugin-react#1248).
const getServerContent = createServerFn({ method: 'GET' }).handler(async () => {
  return renderServerComponent(
    <p data-testid="co-located-server-content">server-rendered content</p>,
  )
})

export const Route = createFileRoute('/co-located')({
  loader: () => getServerContent(),
  component: CoLocatedComponent,
})

function CoLocatedComponent() {
  const Server = Route.useLoaderData()
  const [count, setCount] = useState(0)

  return (
    <main>
      <h1 data-testid="co-located-marker">co-located-baseline</h1>

      <p data-testid="co-located-count">Count: {count}</p>
      <button
        type="button"
        data-testid="co-located-increment"
        onClick={() => setCount((c) => c + 1)}
      >
        Increment
      </button>

      {Server}
    </main>
  )
}
