import * as React from 'react'
import { Await, RouteApi } from '@tanstack/react-router'

const api = new RouteApi({ id: '/hello' })

export const component = function Hello() {
  const { data, slowData } = api.useLoaderData()

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
