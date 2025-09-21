import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/optional-params/simple/{-$id}/path')({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  return (
    <div data-testid="simple-path-heading">
      Hello "/optional-params/simple/-$id/path"!
      <span data-testid="simple-path-params">{JSON.stringify(params())}</span>
    </div>
  )
}
