import { notFound } from '@tanstack/react-router'

export const Route = createFileRoute({
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
    <div data-testid="via-head-route-component">
      Hello "/not-found/via-head"!
    </div>
  )
}
