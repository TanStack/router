import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/other')({
  component: Other,
})

function Other() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <h1 data-testid="other-heading">CSP Navigation Test</h1>
      <button data-testid="counter-btn" onClick={() => setCount((c) => c + 1)}>
        Count: <span data-testid="counter-value">{count}</span>
      </button>
    </div>
  )
}
