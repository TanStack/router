import { createFileRoute } from '@tanstack/react-router'
import { useId } from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const id = useId();

  return (
    <div className="p-2">
      <h3 data-testid="tested-element">{id}</h3>
    </div>
  )
}
