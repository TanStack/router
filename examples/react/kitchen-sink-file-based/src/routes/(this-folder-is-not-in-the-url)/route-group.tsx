import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/(this-folder-is-not-in-the-url)/route-group',
)({
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
