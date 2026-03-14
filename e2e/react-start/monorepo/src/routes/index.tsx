import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="p-8">
      <h1 className="font-bold text-lg">Monorepo E2E Tests</h1>
      <p className="text-gray-600 mb-4">
        Tests for StartInstance.createServerFn / createMiddleware in a monorepo
        setup where external packages do not have access to the app's
        routeTree.gen.ts Register augmentation.
      </p>
      <ul className="list-disc p-4">
        <li>
          <Link to="/analytics-context" data-testid="link-analytics-context">
            Analytics Context - server function using global middleware context
          </Link>
        </li>
        <li>
          <Link to="/analytics-session" data-testid="link-analytics-session">
            Analytics Session - server function using local middleware that
            extends global context
          </Link>
        </li>
      </ul>
    </div>
  )
}
