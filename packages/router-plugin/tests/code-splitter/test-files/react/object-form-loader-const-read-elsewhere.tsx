import { createFileRoute } from '@tanstack/react-router'
import { fetchPost } from '../posts'

const postLoader = {
  handler: ({ params }) => fetchPost(params.postId),
  staleReloadMode: 'background',
}

export const Route = createFileRoute('/posts/$postId')({
  loader: postLoader,
  head: (ctx) => ({ meta: [{ title: postLoader.handler(ctx).title }] }),
  component: PostComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()

  return <div className="p-2">{post.title}</div>
}
