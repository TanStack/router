import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/foo/{-$bar}/qux')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>{'Hello "/foo/{-$bar}/qux"!'}</div>
}
