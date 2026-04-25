import { Await, createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'

const promise = createServerFn().handler(async () => {
  await new Promise((r) => setTimeout(r, 3000))
  return crypto.randomUUID()
})

export const Route = createFileRoute('/issue-6715')({
  component: RouteComponent,
  loader() {
    return { promise: promise() }
  },
})

function RouteComponent() {
  const data = Route.useLoaderData()
  return (
    <>
      data{' '}
      <Await
        fallback={<p data-testid="issue-6715-loading">Loading...</p>}
        promise={data().promise}
      >
        {(data) => <span data-testid="issue-6715-data">{data}</span>}
      </Await>
    </>
  )
}
