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
        <li>
          <Route.Link to="./send-serverFn" data-testid="send-serverFn-link">
            Client Middleware can send server function reference in context
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./request-middleware"
            data-testid="request-middleware-link"
            reloadDocument={true}
          >
            Request Middleware in combination with server function
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./server-import-middleware"
            data-testid="server-import-middleware-link"
          >
            Server imports in middleware are stripped from client build
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./middleware-factory"
            data-testid="middleware-factory-link"
          >
            Middleware factories with server imports are stripped from client
            build
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./redirect-with-middleware"
            data-testid="redirect-with-middleware-link"
          >
            Redirect via server function with middleware
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./function-metadata"
            data-testid="function-metadata-link"
          >
            Function middleware receives functionId and filename
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./server-early-return"
            data-testid="server-early-return-link"
          >
            Server middleware early return (no next() call)
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="/middleware/server-early-return-headers"
            data-testid="server-early-return-headers-link"
          >
            Server middleware early return with headers
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./server-conditional"
            data-testid="server-conditional-link"
          >
            Server middleware conditional return (next() OR value)
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./client-early-return"
            data-testid="client-early-return-link"
          >
            Client middleware early return (no next() call)
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./client-conditional"
            data-testid="client-conditional-link"
          >
            Client middleware conditional return (next() OR value)
          </Route.Link>
        </li>
        <li>
          <Route.Link
            to="./nested-early-return"
            data-testid="nested-early-return-link"
          >
            Nested middleware early return
          </Route.Link>
        </li>
      </ul>
    </div>
  )
}
