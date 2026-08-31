import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const getMessage = createServerFn({ method: 'GET' }).handler(async () => {
  return { message: 'Hello from Bun-bundled Start' }
})

export const Route = createFileRoute('/')({
  loader: () => getMessage(),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>TanStack Start + Bun bundler</h1>
      <p>{data.message}</p>
      <p>
        This example uses <code>@tanstack/react-start/plugin/bun</code> (no Vite).
      </p>
      <p>
        <Link to="/about">About</Link>
      </p>
    </main>
  )
}
