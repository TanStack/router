import { createFileRoute, useLocation } from '@tanstack/solid-router'
import { createEffect, createSignal } from 'solid-js'

export const Route = createFileRoute('/specialChars/hash')({
  component: RouteComponent,
})

function RouteComponent() {
  const location = useLocation()
  const [getHash, setHash] = createSignal('')

  createEffect(() => {
    setHash(location().hash)
  })

  return (
    <div data-testid="special-hash-heading">
      Hello "/specialChars/hash"!
      <span data-testid="special-hash">{getHash()}</span>
    </div>
  )
}
