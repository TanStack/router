import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <button data-testid="counter-btn" onClick={() => setCount((c) => c + 1)}>
        Count: <span data-testid="counter-value">{count}</span>
      </button>
    </div>
  )
}
