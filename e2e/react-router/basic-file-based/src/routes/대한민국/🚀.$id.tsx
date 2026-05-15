import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/대한민국/🚀/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()

  return (
    <div>
      <h3 data-testid="unicode-named-heading">Unicode Named Params</h3>
      <div>
        Hello /대한민국/🚀/
        <span data-testid="unicode-named-params">{params.id}</span>
      </div>
    </div>
  )
}
