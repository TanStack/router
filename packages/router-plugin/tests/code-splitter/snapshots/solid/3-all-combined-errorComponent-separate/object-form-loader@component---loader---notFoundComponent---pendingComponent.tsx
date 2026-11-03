import * as Solid from 'solid-js'
import { Link, Outlet } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'
import { Route } from 'object-form-loader.tsx'
function PostsComponent() {
  const posts = Route.useLoaderData()
  return (
    <div class="p-2 flex gap-2">
      <ul class="list-disc pl-4">
        <Solid.For each={posts()}>
          {(post) => {
            return (
              <li class="whitespace-nowrap">
                <Link to="/posts/$postId" params={{ postId: post.id }}>
                  <div>{post.title}</div>
                </Link>
              </li>
            )
          }}
        </Solid.For>
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
const SplitLoader = () => fetchPosts()
export { SplitLoader as loader }
export { PostsComponent as component }
