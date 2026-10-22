import * as React from 'react'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
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
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {posts.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <Link to="/posts/$postId" params={{ postId: post.id }}>
                <div>{post.title}</div>
              </Link>
            </li>
          )
        })}
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
