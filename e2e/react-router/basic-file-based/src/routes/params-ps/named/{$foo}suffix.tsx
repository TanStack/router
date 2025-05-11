import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/params-ps/named/{$foo}suffix')({
  component: RouteComponent,
})

function RouteComponent() {
  const p = Route.useParams()
  return (
    <div>
      <h3>ParamsNamedFooSuffix</h3>
      <div data-testid="params-output">{JSON.stringify(p)}</div>
    </div>
  )
}
