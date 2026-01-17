import { ErrorComponent, Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createMeta } from '@tanstack/meta'
import { postQueryOptions } from '../utils/posts'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { NotFound } from '~/components/NotFound'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId }, context }) => {
    const data = await context.queryClient.ensureQueryData(
      postQueryOptions(postId),
    )

    return {
      title: data.title,
      body: data.body,
      id: data.id,
    }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? createMeta({
          title: loaderData.title,
          description: loaderData.body.slice(0, 160),
          // In a real app, you'd use an actual URL
          url: `https://example.com/posts/${loaderData.id}`,
          titleTemplate: '%s | TanStack Start',
          // Disable charset/viewport since root already provides them
          charset: false,
          viewport: false,
        })
      : undefined,
  }),
  errorComponent: PostErrorComponent,
  notFoundComponent: () => {
    return <NotFound>Post not found</NotFound>
  },
  component: PostComponent,
})

export function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}

function PostComponent() {
  const { postId } = Route.useParams()
  const postQuery = useSuspenseQuery(postQueryOptions(postId))

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{postQuery.data.title}</h4>
      <div className="text-sm">{postQuery.data.body}</div>
      <Link
        to="/posts/$postId/deep"
        params={{
          postId: postQuery.data.id,
        }}
        activeProps={{ className: 'text-black font-bold' }}
        className="inline-block py-1 text-blue-800 hover:text-blue-600"
      >
        Deep View
      </Link>
    </div>
  )
}
