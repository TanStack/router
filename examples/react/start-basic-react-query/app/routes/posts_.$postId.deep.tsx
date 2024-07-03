import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQueryOptions } from 'convex-tanstack-query'
import { api } from '../../convex/_generated/api'
import { PostErrorComponent } from './posts.$postId'

export const Route = createFileRoute('/posts/$postId/deep')({
  loader: async ({ params: { postId }, context }) => {
    const data = await context.queryClient.fetchQuery(
      convexQueryOptions(api.data.getPost, { id: postId }),
    )

    return {
      title: data.title,
    }
  },
  meta: ({ loaderData }) => [
    {
      title: loaderData.title,
    },
  ],
  errorComponent: PostErrorComponent as any,
  component: PostDeepComponent,
})

function PostDeepComponent() {
  const { postId } = Route.useParams()
  const postQuery = useSuspenseQuery(
    convexQueryOptions(api.data.getPost, { id: postId }),
  )

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
