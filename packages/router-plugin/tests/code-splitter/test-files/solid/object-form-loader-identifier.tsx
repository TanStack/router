import * as Solid from 'solid-js'
import { createFileRoute, Outlet } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'

function loadPosts() {
  return fetchPosts()
}

export const Route = createFileRoute('/posts')({
  loader: {
    handler: loadPosts,
    dehydrate: true,
  },
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
