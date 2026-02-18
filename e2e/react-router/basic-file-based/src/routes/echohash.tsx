import { createFileRoute, useLocation } from '@tanstack/react-router'

export const Route = createFileRoute('/echohash')({
  component: EchoHash,
})

function EchoHash() {
  const { hash } = useLocation()

  return <div data-testid="hash-display">{hash}</div>
}
