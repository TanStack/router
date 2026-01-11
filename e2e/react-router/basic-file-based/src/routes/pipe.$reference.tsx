import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/pipe/$reference')({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  return <h4>Hello {params.reference}!</h4>
}
