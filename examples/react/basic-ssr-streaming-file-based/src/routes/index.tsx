import { createFileRoute, defer, Await } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('/')({
  loader: () => ({
    date: new Date(),
    deferred: defer(
      new Promise<{ date: Date }>((r) =>
        setTimeout(() => r({ date: new Date() }), 1000),
      ),
    ),
  }),
  component: IndexComponent,
})

function IndexComponent() {
  const data = Route.useLoaderData()

  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
      <p>Data: {data.date.getDate()}</p>
      <React.Suspense fallback={'Loading...'}>
        <Await promise={data.deferred}>
          {(data) => <p>Deferred: {data.date.getDate()}</p>}
        </Await>
      </React.Suspense>
    </div>
  )
}
