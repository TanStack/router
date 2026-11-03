import * as React from 'react'
import { Outlet } from '@tanstack/react-router'
import { fetchPosts } from '../posts'
function loadPosts() {
  return fetchPosts()
}
import { Route } from 'object-form-loader-identifier.tsx'
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
export { loadPosts as loader }
export { PostsComponent as component }
