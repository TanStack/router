import * as React from 'react'
import { Link, RouteApi } from '@tanstack/react-router'

const api = new RouteApi({ id: '/posts/$postId' })

export const component = function PostComponent() {
  const post = api.useLoaderData()
  //    ^?

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
      <Link
        to="/posts/$postId/deep"
        params={{
          postId: post.id,
        }}
        activeProps={{ className: 'text-black font-bold' }}
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        Deep View
      </Link>
    </div>
  )
}
