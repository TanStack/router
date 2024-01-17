import * as React from 'react'
import { Await, FileRoute, defer } from '@tanstack/react-router'

async function getData() {
  'use server'

  return new Promise<string>((r) => {
    setTimeout(() => r('Server says hello, too!'), 500)
  })
}

async function getSlowData() {
  'use server'

  return new Promise<string>((r) => {
    setTimeout(() => r('Server slowly says.... hello again!'), 2000)
  })
}

export const Route = new FileRoute('/hello').createRoute({
  component: Hello,
  loader: async () => {
    // Kick off the slow data request as soon as possible
    const slowData = defer(getSlowData())

    return {
      // Await the critical data
      data: await getData(),
      slowData,
    }
  },
})

function Hello() {
  const { data, slowData } = Route.useLoaderData()

  return (
    <div className="p-2">
      <p>Hello from the client!</p>
      <p>{data}</p>
      <React.Suspense fallback={<p>Loading...</p>}>
        <Await promise={slowData}>{(slowData) => <p>{slowData}</p>}</Await>
      </React.Suspense>
    </div>
  )
}
