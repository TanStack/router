import { Link, createFileRoute } from '@tanstack/solid-router'

import { PostErrorComponent } from './posts.$postId'
import { fetchPost } from '~/utils/posts'

export const Route = createFileRoute('/posts_/$postId/deep')({
  loader: async ({ params: { postId } }) => fetchPost({ data: postId }),
  errorComponent: PostErrorComponent,
  component: PostDeepComponent,
})

function PostDeepComponent() {
  const post = Route.useLoaderData()

  return (
    <div class="p-2 space-y-2">
      <Link to="/posts" class="block py-1 text-blue-800 hover:text-blue-600">
        ← All Posts
      </Link>
      <h4 class="text-xl font-bold underline">{post.title}</h4>
      <div class="text-sm">{post.body}</div>
    </div>
  )
}
