import { Link, createFileRoute } from '@tanstack/react-router'
import { fetchPost } from '../utils/posts'
import { PostErrorComponent } from '~/components/PostError'

export const Route = createFileRoute('/posts_/$postId/deep')({
  loader: async ({ params: { postId } }) =>
    fetchPost({
      data: postId,
    }),
  errorComponent: PostErrorComponent,
  component: PostDeepComponent,
})

/**
 * Display a detailed post view with navigation back to the posts list.
 *
 * Shows the post title and body using the data provided by the route loader,
 * and renders a link to return to the "All Posts" page.
 *
 * @returns A JSX element rendering the post detail UI
 */
function PostDeepComponent() {
  const post = Route.useLoaderData()

  return (
    <div className="p-2 space-y-2">
      <Link
        to="/posts"
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        ← All Posts
      </Link>
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}