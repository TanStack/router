import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(virtualLayout)/qux/_quxLayout')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(virtualLayout)/qux/_quxLayout"!</div>
}
