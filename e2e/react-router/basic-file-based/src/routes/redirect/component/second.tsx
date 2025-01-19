import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/redirect/component/second')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div data-testid="second">Hello "/redirect/component/second"!</div>
}
