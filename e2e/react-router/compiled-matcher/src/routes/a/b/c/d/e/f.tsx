import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/a/b/c/d/e/f')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/a/b/c/d/e/f"!</div>
}
