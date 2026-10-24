import * as React from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
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
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      <Outlet />
    </div>
  )
}
