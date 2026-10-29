import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts/$postId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/posts/$postId"!</div>
}
