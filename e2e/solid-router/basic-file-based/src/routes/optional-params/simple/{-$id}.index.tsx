import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/optional-params/simple/{-$id}/')({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()

  return (
    <div data-testid="simple-index-heading">
      Hello "/optional-params/simple/-$id/"!
      <span data-testid="simple-index-params">{JSON.stringify(params())}</span>
    </div>
  )
}
