import { createServerFn, renderRsc } from '@tanstack/react-start'
import { renderPosts } from '~/utils/renderPosts'

export const serverRenderPosts = createServerFn({ method: 'GET' }).handler(
  renderPosts,
)

export const Route = createFileRoute({
  loader: async () => serverRenderPosts(),
  component: PostsComponent,
})

function PostsComponent() {
  return renderRsc(Route.useLoaderData())
}
