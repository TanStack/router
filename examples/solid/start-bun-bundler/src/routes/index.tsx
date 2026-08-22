import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'

const getMessage = createServerFn({ method: 'GET' }).handler(async () => {
  return { message: 'Hello from Bun-bundled Solid Start' }
})

export const Route = createFileRoute('/')({
  loader: () => getMessage(),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  return (
    <main style={{ 'font-family': 'system-ui', padding: '24px' }}>
      <h1>TanStack Solid Start + Bun bundler</h1>
      <p>{data().message}</p>
      <p>
        This example uses <code>@tanstack/solid-start/plugin/bun</code> (no
        Vite).
      </p>
      <p>
        <a href="/about">About</a>
      </p>
    </main>
  )
}
