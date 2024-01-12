import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

async function getData() {
  'use server'

  const res = await new Promise<string>((res) => {
    setTimeout(() => {
      res('Server says hello!')
    }, 2000)
  })

  return res
}

export const Route = new FileRoute('/hello').createRoute({
  component: Hello,
  loader: async () => {
    const data = await getData()
    return data
  },
  pendingComponent: () => <div>Loading...</div>,
})

function Hello() {
  const data = Route.useLoaderData()
  return (
    <div>
      <p>hello</p>
      <p>{data}</p>
    </div>
  )
}
