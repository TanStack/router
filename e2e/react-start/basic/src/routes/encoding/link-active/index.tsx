import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/encoding/link-active/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <Route.Link to="$target" params={{ target: 'ê' }}>
        link to $target=ê
      </Route.Link>
      <br />
      <Route.Link to="$target" params={{ target: 'hello' }}>
        link to $target=hello
      </Route.Link>
    </div>
  )
}
