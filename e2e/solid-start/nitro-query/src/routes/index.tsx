import { createFileRoute } from '@tanstack/solid-router'
import { createQuery } from '@tanstack/solid-query'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const query = createQuery(() => ({
    queryKey: ['nitro-query-e2e'],
    queryFn: () => Promise.resolve('ok'),
    initialData: 'ok',
  }))
  return (
    <div>
      <h1>Nitro Query E2E</h1>
      <div data-testid="query-data">{query.data}</div>
    </div>
  )
}
