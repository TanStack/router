import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute(
  '/optional-params/withIndex/{-$id}/$category/path/',
)({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  return (
    <div data-testid="withIndex-path-heading">
      Hello "/optional-params/withIndex/-$id/$category/path"!
      <span data-testid="withIndex-path-params">
        {JSON.stringify(params())}
      </span>
    </div>
  )
}
