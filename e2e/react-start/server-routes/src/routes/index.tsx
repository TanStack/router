import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="p-8">
      <h1 className="font-bold text-lg">Server Routes E2E tests</h1>
      <ul className="list-disc p-4">
        <li>
          <Link to="/merge-server-fn-middleware-context">
            server function middleware context is merged correctly
          </Link>
        </li>
      </ul>
    </div>
  )
}
