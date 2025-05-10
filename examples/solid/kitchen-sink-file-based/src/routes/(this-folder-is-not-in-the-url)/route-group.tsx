import * as Solid from 'solid-js'

export const Route = createFileRoute({
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
