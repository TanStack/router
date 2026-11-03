import { createFileRoute } from '@tanstack/react-router'
import { postsApi } from '../posts'

export const Route = createFileRoute('/posts')({
  loader: {
    handler: postsApi.list,
    staleReloadMode: 'background',
  },
  component: PostsComponent,
})

function PostsComponent() {
  return <div className="p-2">{Route.useLoaderData().length}</div>
}
