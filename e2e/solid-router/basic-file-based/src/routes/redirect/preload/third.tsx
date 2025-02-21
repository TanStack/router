import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/redirect/preload/third')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div data-testid="third">Hello "/redirect/preload/third"!</div>
}
