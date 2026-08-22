import { createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'

const getMessage = createServerFn({ method: 'GET' }).handler(async () => {
  return { message: 'Hello from Bun-bundled Vue Start' }
})

export const Route = createFileRoute('/')({
  loader: () => getMessage(),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  return (
    <main style={{ fontFamily: 'system-ui', padding: '24px' }}>
      <h1>TanStack Vue Start + Bun bundler</h1>
      <p>{data.value.message}</p>
      <p>
        This example uses <code>@tanstack/vue-start/plugin/bun</code> (no Vite).
      </p>
      <p>
        <a href="/about">About</a>
      </p>
    </main>
  )
}
