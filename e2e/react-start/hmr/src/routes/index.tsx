import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const [count, setCount] = useState(0)

  return (
    <main>
      <button data-testid="increment" onClick={() => setCount((d) => d + 1)}>
        Increment
      </button>
      <p data-testid="count">Count: {count}</p>
      <input data-testid="message" defaultValue="" />
      <h1 data-testid="heading">HMR State Test</h1>
      <p data-testid="marker">baseline</p>
      <ClientOnly>
        <p data-testid="hydrated">hydrated</p>
      </ClientOnly>
    </main>
  )
}
