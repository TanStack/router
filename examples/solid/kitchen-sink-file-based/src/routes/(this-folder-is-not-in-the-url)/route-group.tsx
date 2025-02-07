import * as React from 'solid-js'
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute(
  '/(this-folder-is-not-in-the-url)/route-group',
)({
  component: RouteGroupExample,
})

function RouteGroupExample() {
  return (
    <div class={`p-2`}>
      <div class={`text-lg`}>Welcome to the Route Group Example!</div>
      <hr class={`my-2`} />
    </div>
  )
}
