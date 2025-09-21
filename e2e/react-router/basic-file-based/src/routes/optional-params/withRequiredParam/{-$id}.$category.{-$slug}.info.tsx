import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/optional-params/withRequiredParam/{-$id}/$category/{-$slug}/info',
)({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  return (
    <>
      <div data-testid="withRequiredParam-heading">
        Hello "/optional-params/-$id/$category/-$slug/info"! aaaa
      </div>
      <div>
        params:{' '}
        <span data-testid="withRequiredParam-id-category-slug-info-params">
          {JSON.stringify(params)}
        </span>
      </div>
    </>
  )
}
