import { createFileRoute, Outlet } from '@tanstack/react-router'
import { getPost } from '~/utils/posts'

export const Route = createFileRoute('/posts/$postId')({
  context: ({ params }) => {
    return { postIdContextCtx: `postId-context-${params.postId}` }
  },
  beforeLoad: ({ params }) => {
    return { postIdBeforeLoadCtx: `postId-beforeLoad-${params.postId}` }
  },
  loader: ({ params }) => {
    const post = getPost(Number(params.postId))
    if (!post) {
      throw new Error(`Post ${params.postId} not found`)
    }
    return { post }
  },
  component: PostComponent,
})

function PostComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="post-component">
      <h3 data-testid="post-heading">{loaderData.post.title}</h3>
      <p data-testid="post-body">{loaderData.post.body}</p>
      <div data-testid="post-context">{context.postIdContextCtx}</div>
      <div data-testid="post-beforeLoad">{context.postIdBeforeLoadCtx}</div>
      <Outlet />
    </div>
  )
}
