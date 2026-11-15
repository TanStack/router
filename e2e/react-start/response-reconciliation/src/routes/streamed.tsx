import { Await, createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

export const Route = createFileRoute('/streamed')({
  loader: () => ({
    deferred: new Promise<string>((resolve) =>
      setTimeout(() => resolve('streamed after the shell'), 100),
    ),
  }),
  component: StreamedRoute,
})

function StreamedRoute() {
  const { deferred } = Route.useLoaderData()
  return (
    <main>
      <h1>Streamed document</h1>
      <Suspense fallback={<p>loading</p>}>
        <Await promise={deferred}>
          {(value) => <p data-testid="streamed-value">{value}</p>}
        </Await>
      </Suspense>
    </main>
  )
}
