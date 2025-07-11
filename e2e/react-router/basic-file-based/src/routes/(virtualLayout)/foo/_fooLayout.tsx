import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(virtualLayout)/foo/_fooLayout')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(virtualLayout)/foo/_fooLayout"!</div>
}
