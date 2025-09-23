import { Link, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div class="p-8">
      <h1 class="font-bold text-lg">Server routes E2E tests</h1>
      <ul class="list-disc p-4">
        <li>
          <Link to="/merge-server-fn-middleware-context">
            server function middleware context is merged correctly
          </Link>
        </li>
      </ul>
    </div>
  )
}
