import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/optional-params/withRequiredInBetween/{-$id}/$category/path/{-$slug}',
)({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()

  return (
    <>
      <div data-testid="withRequiredInBetween-heading">
        Hello
        "/optional-params/withRequiredInBetween/-$id/$category/path/$slug"!
      </div>
      <div>
        params:{' '}
        <span data-testid="withRequiredInBetween-id-category-path-slug-params">
          {JSON.stringify(params)}
        </span>
      </div>
    </>
  )
}
