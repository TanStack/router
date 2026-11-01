import * as React from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { fetchPosts } from '../posts'

const postsLoader = {
  handler: () => fetchPosts(),
  staleReloadMode: 'background',
}

export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: PostsComponent,
})

function PostsComponent() {
  const posts = Route.useLoaderData()

  return (
    <div className="p-2 flex gap-2">
      <p>{postsLoader.staleReloadMode}</p>
      <ul className="list-disc pl-4">
        {posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      <Outlet />
    </div>
  )
}
