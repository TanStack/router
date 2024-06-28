import { createFileRoute, Link } from '@tanstack/react-router'
import { PostErrorComponent } from './posts.$postId'
import { postQueryOptions } from '../utils/posts'
import { useSuspenseQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/posts/$postId/deep')({
  loader: async ({ params: { postId }, context }) => {
    await context.queryClient.prefetchQuery(postQueryOptions(postId))
  },
  errorComponent: PostErrorComponent as any,
  component: PostDeepComponent,
})

function PostDeepComponent() {
  const { postId } = Route.useParams()
  const postQuery = useSuspenseQuery(postQueryOptions(postId))

  return (
    <div className="p-2 space-y-2">
      <Link
        to="/posts"
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        ← All Posts
      </Link>
      <h4 className="text-xl font-bold underline">{postQuery.data.title}</h4>
      <div className="text-sm">{postQuery.data.body}</div>
    </div>
  )
}
