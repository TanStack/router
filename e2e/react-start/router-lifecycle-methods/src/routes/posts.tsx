import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { posts } from '~/utils/posts'

export const Route = createFileRoute('/posts')({
  context: () => {
    return { postsContextCtx: 'posts-context' }
  },
  beforeLoad: () => {
    return { postsBeforeLoadCtx: 'posts-beforeLoad' }
  },
  loader: () => {
    return { posts }
  },
  component: PostsComponent,
})

function PostsComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="posts-component">
      <h2 data-testid="posts-heading">Posts Layout</h2>
      <div data-testid="posts-context">{context.postsContextCtx}</div>
      <div data-testid="posts-beforeLoad">{context.postsBeforeLoadCtx}</div>
      <div data-testid="posts-nav">
        {loaderData.posts.map((post) => (
          <div key={post.id}>
            <Link
              to="/posts/$postId"
              params={{ postId: String(post.id) }}
              data-testid={`posts-link-${post.id}`}
            >
              {post.title}
            </Link>
          </div>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
