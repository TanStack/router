import {
  ErrorComponent,
  ErrorComponentProps,
  Link,
  createFileRoute,
} from '@tanstack/react-router'
import { fetchPost } from '../utils/posts'
import { NotFound } from '~/components/NotFound'
import { createServerFn } from '@tanstack/start'

const renderPost = createServerFn('GET', async (postId: string) => {
  const post = await fetchPost(postId)

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
      <Link
        to="/posts/$postId/deep"
        params={{
          postId: post.id,
        }}
        activeProps={{ className: 'text-black font-bold' }}
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        Deep View
      </Link>
    </div>
  )
})

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => renderPost(postId),
  errorComponent: PostErrorComponent as any,
  component: PostComponent,
  notFoundComponent: () => {
    return <NotFound>Post not found</NotFound>
  },
})

export function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}

function PostComponent() {
  return Route.useLoaderData()
}
