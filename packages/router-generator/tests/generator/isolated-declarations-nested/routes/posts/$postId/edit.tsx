import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId/edit')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/posts/$postId/edit"!</div>
}
