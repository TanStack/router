import * as React from 'react'
import { Link, Outlet } from '@tanstack/react-router'
import { Route } from 'object-form-loader.tsx'
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
export { PostsComponent as component }
