import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(virtualLayout)/bar')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(virtualLayout)/bar"!</div>
}
