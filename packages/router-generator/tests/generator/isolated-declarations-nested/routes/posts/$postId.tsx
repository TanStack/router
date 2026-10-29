import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => ({ postId: params.postId }),
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/posts/$postId"!</div>
}
