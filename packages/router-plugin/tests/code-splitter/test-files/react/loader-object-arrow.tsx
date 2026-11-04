import { createFileRoute } from '@tanstack/react-router'
import { fetchPost } from '../posts'

export const Route = createFileRoute('/posts/$postId')({
  loader: {
    staleReloadMode: 'blocking',
    handler: async ({ params }) => fetchPost(params.postId),
  },
  component: PostComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()
  return <div>{post.title}</div>
}
