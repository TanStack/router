import { createFileRoute } from '@tanstack/react-router'
import { fetchPost } from '../posts'
import { readSecret } from '../server-only'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => fetchPost({ data: params.postId }),
  // Only the server uses the three options below.
  server: {
    handlers: {
      POST: ({ params }) =>
        Response.json({ postId: params.postId, secret: readSecret() }),
    },
  },
  headers: () => ({ 'x-secret-length': String(readSecret().length) }),
  ssr: 'data-only',
  component: PostPage,
})

function PostPage() {
  const post = Route.useLoaderData()

  return (
    <main>
      <h1>{post.title}</h1>
    </main>
  )
}
