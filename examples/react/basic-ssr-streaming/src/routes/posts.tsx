import * as React from 'react'
import { Link, Outlet, Route } from '@tanstack/router'
import { rootRoute } from './__root'
import { useLoader } from '@tanstack/react-loaders'
import { postIdRoute } from './posts/$postId'
import { postsLoader } from '../loaderClient'

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  component: Posts,
  errorComponent: () => 'Oh crap',
  getContext: () => ({
    title: 'Posts',
  }),
  loader: ({ context, preload }) =>
    context.loaderClient.loaders.postsLoader.load({ preload }),
})

function Posts() {
  const {
    state: { data: posts },
  } = useLoader({ loader: postsLoader })

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {posts?.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <Link
                to={postIdRoute.to}
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
