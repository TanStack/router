import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(virtualLayout)/quux/_quuxLayout/hello')(
  {
    component: RouteComponent,
  },
)

function RouteComponent() {
  return <div>Hello "/(virtualLayout)/quux/_quuxLayout/hello"!</div>
}
