import { createFileRoute } from '@tanstack/solid-router'
import { postsApi } from '../posts'

export const Route = createFileRoute('/posts')({
  loader: {
    handler: postsApi.list,
    staleReloadMode: 'background',
  },
  component: PostsComponent,
})

function PostsComponent() {
  return <div class="p-2">{Route.useLoaderData()().length}</div>
}
