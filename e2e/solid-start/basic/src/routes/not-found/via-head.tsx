import { createFileRoute, notFound } from '@tanstack/solid-router'

export const Route = createFileRoute('/not-found/via-head')({
  head: () => {
    throw notFound()
  },
  component: RouteComponent,
  notFoundComponent: () => {
    return (
      <div data-testid="via-head-notFound-component">
        Not Found "/not-found/via-head"!
      </div>
    )
  },
})

function RouteComponent() {
  return (
    <div data-testid="via-head-route-component" data-server={typeof window}>
      Hello "/not-found/via-head"!
    </div>
  )
}
