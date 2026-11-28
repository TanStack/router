import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  component: PostPage,
})

function PostPage() {
  const params = Route.useParams()

  return <main>{`post ${params.postId}`}</main>
}
