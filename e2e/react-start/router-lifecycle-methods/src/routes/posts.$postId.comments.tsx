import { createFileRoute } from '@tanstack/react-router'
import { getPostComments } from '~/utils/posts'

export const Route = createFileRoute('/posts/$postId/comments')({
  context: ({ params }) => {
    return { commentsContextCtx: `comments-context-${params.postId}` }
  },
  beforeLoad: ({ params }) => {
    return { commentsBeforeLoadCtx: `comments-beforeLoad-${params.postId}` }
  },
  loader: ({ params }) => {
    return { comments: getPostComments(Number(params.postId)) }
  },
  component: CommentsComponent,
})

function CommentsComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="comments-component">
      <h4 data-testid="comments-heading">Comments</h4>
      <div data-testid="comments-context">{context.commentsContextCtx}</div>
      <div data-testid="comments-beforeLoad">
        {context.commentsBeforeLoadCtx}
      </div>
      <ul data-testid="comments-list">
        {loaderData.comments.map((c) => (
          <li key={c.id} data-testid={`comment-${c.id}`}>
            {c.author}: {c.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
