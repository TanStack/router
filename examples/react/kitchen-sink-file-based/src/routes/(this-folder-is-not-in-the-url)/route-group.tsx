import * as React from 'react'

export const Route = createFileRoute({
  component: RouteGroupExample,
})

function RouteGroupExample() {
  return (
    <div className={`p-2`}>
      <div className={`text-lg`}>Welcome to the Route Group Example!</div>
      <hr className={`my-2`} />
    </div>
  )
}
