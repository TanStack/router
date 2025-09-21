import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute(
  '/optional-params/withIndex/{-$id}/$category/',
)({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  return (
    <div data-testid="withIndex-index-heading">
      Hello "/optional-params/withIndex/-$id/$category/"!
      <span data-testid="withIndex-index-params">
        {JSON.stringify(params())}
      </span>
    </div>
  )
}
