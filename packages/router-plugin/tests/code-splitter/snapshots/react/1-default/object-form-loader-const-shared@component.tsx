import { postsLoader } from 'object-form-loader-const-shared.tsx?tsr-shared=1'
import * as React from 'react'
import { Outlet } from '@tanstack/react-router'
import { Route } from 'object-form-loader-const-shared.tsx'
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
export { PostsComponent as component }
