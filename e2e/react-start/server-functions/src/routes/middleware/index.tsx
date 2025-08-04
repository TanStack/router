import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/middleware/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="p-8">
      <h1 className="font-bold text-lg">
        Server functions middleware E2E tests
      </h1>
      <ul className="list-disc p-4">
        <li>
          <Route.Link
            to="./client-middleware-router"
            data-testid="client-middleware-router-link"
          >
            Client Middleware has access to router instance
          </Route.Link>
        </li>
      </ul>
    </div>
  )
}
