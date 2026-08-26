import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'

let count = 0
let reads = 0

const readCount = createServerFn().handler(() => {
  return { count, reads: ++reads }
})

const incrementCount = createServerFn({ method: 'POST' }).handler(() => {
  return ++count
})

export const Route = createFileRoute('/single-flight')({
  loader: () => readCount(),
  component: SingleFlight,
})

function SingleFlight() {
  const data = Route.useLoaderData()

  return (
    <main>
      <p data-testid="single-flight-count">{data().count}</p>
      <p data-testid="single-flight-reads">{data().reads}</p>
      <button
        type="button"
        data-testid="single-flight-mutate"
        onClick={() => incrementCount()}
      >
        Increment
      </button>
    </main>
  )
}
