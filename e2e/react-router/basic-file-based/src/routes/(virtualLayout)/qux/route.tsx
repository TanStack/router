import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(virtualLayout)/qux')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(virtualLayout)/qux"!</div>
}
