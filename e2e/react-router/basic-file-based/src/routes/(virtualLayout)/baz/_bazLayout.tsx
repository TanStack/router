import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(virtualLayout)/baz/_bazLayout')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(virtualLayout)/baz/_bazLayout"!</div>
}
