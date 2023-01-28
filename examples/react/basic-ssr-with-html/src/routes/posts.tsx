import * as React from 'react'
import { Link, Outlet, Route } from '@tanstack/react-router'
import { rootRoute } from './__root'
// import { loaderClient } from '../entry-client'
import { useLoaderInstance } from '@tanstack/react-loaders'
import { postIdRoute } from './posts/$postId'

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  component: Posts,
  errorComponent: () => 'Oh crap',
  getContext: ({ context: { loaderClient } }) => ({
    getTitle: () => {
      const postsCount = loaderClient.getLoader({ key: 'posts' }).getInstance()
        .state.data?.length

      return `Posts (${postsCount})`
    },
  }),
  onLoad: ({ context, preload }) =>
    context.loaderClient.getLoader({ key: 'posts' }).load({ preload }),
})

function Posts() {
  const {
    state: { data: posts },
  } = useLoaderInstance({ key: 'posts' })

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {posts?.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <Link
                to={postIdRoute.id}
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
        })}
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
