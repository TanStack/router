import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/component-hmr-inline-nosplit')({
  codeSplitGroupings: [],
  component: () => {
    const [count, setCount] = useState(0)

    return (
      <main>
        <button
          data-testid="component-hmr-increment"
          onClick={() => setCount((value) => value + 1)}
        >
          Increment
        </button>
        <p data-testid="component-hmr-count">Count: {count}</p>
        <input data-testid="component-hmr-message" defaultValue="" />
        <p data-testid="component-hmr-marker">
          component-hmr-inline-nosplit-baseline
        </p>
      </main>
    )
  },
})
