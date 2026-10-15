import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/component-hmr-exported-split')({
  component: ComponentHmrPage,
})

// Private values the exported component reads: they are shared with the
// split component, next to the component
const markerClassNames = { marker: 'hmr-marker' }

function markerClassName() {
  return markerClassNames.marker
}

export function ComponentHmrMarker() {
  return (
    <p className={markerClassName()} data-testid="component-hmr-marker">
      component-hmr-exported-split-baseline
    </p>
  )
}

function ComponentHmrPage() {
  const [count, setCount] = useState(0)

  return (
    <main className="hmr-card flex flex-col gap-5">
      <ComponentHmrMarker />
      <p data-testid="component-hmr-count">Count: {count}</p>
      <button
        data-testid="component-hmr-increment"
        onClick={() => setCount((value) => value + 1)}
      >
        Increment
      </button>
      <input data-testid="component-hmr-message" defaultValue="" />
    </main>
  )
}
