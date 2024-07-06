import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: AboutComponent,
  beforeLoad: async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    return { someData: 'hello' }
  },
  loader: async ({ context }) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.debug(context.someData)
  },
})

function AboutComponent() {
  return (
    <div className="p-2">
      <h3>About</h3>
    </div>
  )
}
