import * as React from 'react'
import { Link, Outlet, createLazyRoute } from '@tanstack/react-router'

export const Route = createLazyRoute('/posts')({
  component: PostsComponent,
})

function PostsComponent() {
  const posts = Route.useLoaderData()

  return (
    <div className="p-2 flex gap-2">
      <div className="list-disc bg-gray-800/70 rounded-lg divide-y divide-green-500/30">
        {[...posts, { id: 'i-do-not-exist', title: 'Non-existent Post' }]?.map(
          (post) => {
            return (
              <div key={post.id} className="whitespace-nowrap">
                <Link
                  to="/posts/$postId"
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 px-2 text-green-300 hover:text-green-200"
                  activeProps={{ className: '!text-white font-bold' }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </div>
            )
          },
        )}
      </div>
      <Outlet />
    </div>
  )
}
