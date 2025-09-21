import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/optional-params/consecutive/{-$id}/{-$slug}/$category/info',
)({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  return (
    <>
      <div data-testid="consecutive-heading">
        Hello "/optional-params/consecutive/-$id/-$slug/$category/info"!
      </div>
      <div>
        params:{' '}
        <span data-testid="consecutive-id-slug-category-info-params">
          {JSON.stringify(params)}
        </span>
      </div>
    </>
  )
}
