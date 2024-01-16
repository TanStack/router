import * as React from 'react'
import { Await, FileRoute, defer } from '@tanstack/react-router'

async function getData() {
  'use server'

  return new Promise<string>((r) => {
    setTimeout(() => r('Server says hello!'), 500)
  })
}

async function getSlowData() {
  'use server'

  return new Promise<string>((r) => {
    setTimeout(() => r('Server slowly says.... hello!'), 2000)
  })
}

export const Route = new FileRoute('/hello').createRoute({
  component: Hello,
  loader: async () => ({
    data: await getData(),
    slowData: defer(getSlowData()),
  }),
  pendingComponent: () => <div>Loading...</div>,
})

function Hello() {
  const { data, slowData } = Route.useLoaderData()

  return (
    <div>
      <p>Hello from the client...</p>
      <p>{data}</p>
      <React.Suspense fallback={<p>Loading...</p>}>
        <Await promise={slowData}>{(slowData) => <p>{slowData}</p>}</Await>
      </React.Suspense>
    </div>
  )
}
