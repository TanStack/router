import * as React from 'react'
import { Link, Outlet } from '@tanstack/react-router'
import { postsRoute } from './postsRoute'
import { useLoaderInstance } from '@tanstack/react-loaders'

export const Posts: typeof postsRoute['options']['component'] = () => {
  const { data: posts } = useLoaderInstance({ key: 'posts' })

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {[...posts, { id: 'i-do-not-exist', title: 'Non-existent Post' }]?.map(
          (post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to="/posts/$postId"
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ className: 'text-black font-bold' }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            )
          },
        )}
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
