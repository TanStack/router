import { createFileRoute } from '@tanstack/solid-router'
import Counter from '~/components/Counter'
import { fetchNumbers } from '~/lib/server'

export const Route = createFileRoute('/')({
  component: RouteComponent,
  loader: async () => {
    const numbers = await fetchNumbers()
    return { numbers }
  },
})

function RouteComponent() {
  const loaderData = Route.useLoaderData()
  return (
    <main>
      <h1>Hello world!</h1>
      <Counter />
      <pre>{JSON.stringify(loaderData().numbers, null, 2)}</pre>
    </main>
  )
}
