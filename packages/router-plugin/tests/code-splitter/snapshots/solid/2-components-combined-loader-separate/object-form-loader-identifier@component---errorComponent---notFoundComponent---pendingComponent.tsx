import * as Solid from 'solid-js'
import { Outlet } from '@tanstack/solid-router'
import { Route } from 'object-form-loader-identifier.tsx'
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
export { PostsComponent as component }
