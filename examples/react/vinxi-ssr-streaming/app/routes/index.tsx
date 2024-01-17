import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

function getData() {
  'use server'

  return new Promise<string>((r) => {
    setTimeout(() => r('Server: Welcome home!'), 1000)
  })
}

export const Route = new FileRoute('/').createRoute({
  component: Home,
  loader: () => getData(),
})

function Home() {
  const data = Route.useLoaderData()

  return (
    <div className="p-2">
      <h3>{data}</h3>
    </div>
  )
}
