import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  ssr: () => {
    throw new Error('ssr() should not be called in SPA mode')
  },
  beforeLoad: () => {
    console.log(
      `beforeLoad for ${Route.id} called on the ${typeof window !== 'undefined' ? 'client' : 'server'}`,
    )
    return {
      posts: typeof window === 'undefined' ? 'server' : 'client',
    }
  },
  loader: () => {
    console.log(
      `loader for ${Route.id} called on the ${typeof window !== 'undefined' ? 'client' : 'server'}`,
    )

    return { posts: typeof window === 'undefined' ? 'server' : 'client' }
  },
  component: () => {
    return (
      <div data-testid="posts-container">
        <h3 data-testid="posts-heading">posts</h3>
        <div>
          loader:{' '}
          <b data-testid="posts-loader">{Route.useLoaderData().posts}</b>
        </div>
        <div>
          context:{' '}
          <b data-testid="posts-context">{Route.useRouteContext().posts}</b>
        </div>
        <hr />
        <Outlet />
      </div>
    )
  },
  pendingComponent: () => <div>posts Loading...</div>,
})
