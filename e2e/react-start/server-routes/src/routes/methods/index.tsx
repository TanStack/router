import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/methods/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="p-8">
      <ul className="list-disc p-4">
        <li>
          <Route.Link to="./only-any">
            Server Route only has ANY handler
          </Route.Link>
        </li>
      </ul>
    </div>
  )
}
