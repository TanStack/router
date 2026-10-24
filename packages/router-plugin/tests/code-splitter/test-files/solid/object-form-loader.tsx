import * as Solid from 'solid-js'
import { createFileRoute, Link, Outlet } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'
import { toWire } from '../server-only'
import { fromWire } from '../client-only'

export const Route = createFileRoute('/posts')({
  loader: {
    handler: () => fetchPosts(),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
    staleReloadMode: 'background',
  },
  component: PostsComponent,
})

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
