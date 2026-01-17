import { createFileRoute, useLocation } from '@tanstack/vue-router'

export const Route = createFileRoute('/specialChars/hash')({
  component: RouteComponent,
})

function RouteComponent() {
  const l = useLocation()
  return (
    <div data-testid="special-hash-heading">
      Hello "/specialChars/hash"!
      <span data-testid="special-hash">{l.value.hash}</span>
    </div>
  )
}
