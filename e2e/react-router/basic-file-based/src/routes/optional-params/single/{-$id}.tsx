import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/optional-params/single/{-$id}')({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  return (
    <>
      <div data-testid="single-id-heading">
        Hello "/optional-params/single/-$id"!
      </div>
      <span data-testid="single-id-params">{JSON.stringify(params)}</span>
    </>
  )
}
