import * as React from 'react'
import { Link, RouteApi } from '@tanstack/react-router'

const api = new RouteApi({ id: '/posts/$postId/deep' })

export const component = function PostDeepComponent() {
  const post = api.useLoaderData()

  return (
    <div className="p-2 space-y-2">
      <Link
        to="/posts"
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        ← All Posts
      </Link>
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
