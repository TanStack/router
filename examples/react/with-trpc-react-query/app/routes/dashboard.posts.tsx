import * as React from 'react'
import {
  Link,
  MatchRoute,
  Outlet,
  createFileRoute,
} from '@tanstack/react-router'

import { trpc } from '../router'
import { Spinner } from './-components/spinner'

export const Route = createFileRoute('/dashboard/posts')({
  errorComponent: () => 'Oh crap!',
  loader: async ({ context: { trpcQueryUtils } }) => {
    await trpcQueryUtils.posts.ensureData()
    return
  },
  pendingComponent: Spinner,
  component: DashboardPostsComponent,
})

function DashboardPostsComponent() {
  const postsQuery = trpc.posts.useQuery()

  const posts = postsQuery.data || []

  return (
    <div className="flex-1 flex">
      <div className="divide-y w-48">
        {posts.map((post) => {
          return (
            <div key={post.id}>
              <Link
                to="/dashboard/posts/$postId"
                params={{
                  postId: post.id,
                }}
                preload="intent"
                className="block py-2 px-3 text-blue-700"
                activeProps={{ className: `font-bold` }}
              >
                <pre className="text-sm">
                  #{post.id} - {post.title}{' '}
                  <MatchRoute
                    to="/dashboard/posts/$postId"
                    params={{
                      postId: post.id,
                    }}
                    pending
                  >
                    <Spinner />
                  </MatchRoute>
                </pre>
              </Link>
            </div>
          )
        })}
      </div>
      <div className="flex-1 border-l border-gray-200">
        <Outlet />
      </div>
    </div>
  )
}
