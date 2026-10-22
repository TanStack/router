import * as Solid from 'solid-js'
import { createFileRoute, Outlet } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'

const postsLoader = {
  handler: () => fetchPosts(),
  dehydrate: true,
}

export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: PostsComponent,
})

function PostsComponent() {
  const posts = Route.useLoaderData()

  return (
    <div class="p-2 flex gap-2">
      <ul class="list-disc pl-4">
        <Solid.For each={posts()}>{(post) => <li>{post.title}</li>}</Solid.For>
      </ul>
      <Outlet />
    </div>
  )
}
