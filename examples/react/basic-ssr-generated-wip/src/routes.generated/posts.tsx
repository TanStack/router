import { lazy } from '@tanstack/react-router'
import { route as parentRoute } from './__root'
import * as React from 'react'
import { Link, Outlet, Route } from '@tanstack/react-router'
import { rootRoute } from './__root'
// import { loaderClient } from '../entry-client'
import { Loader, useLoaderInstance } from '@tanstack/react-loaders'
import { postIdRoute, PostType } from './posts/$postId'
export const postsLoader = new Loader({
  key: 'posts',
  loader: async () => {
    console.log('Fetching posts...')
    await new Promise((r) =>
      setTimeout(r, 300 + Math.round(Math.random() * 300)),
    )
    return fetch('https://jsonplaceholder.typicode.com/posts')
      .then((d) => d.json() as Promise<PostType[]>)
      .then((d) => d.slice(0, 10))
  },
})
export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  component: Posts,
  errorComponent: () => 'Oh crap',
  onLoad: ({ context, preload }) =>
    context.loaderClient
      .getLoader({
        key: 'posts',
      })
      .load({
        preload,
      }),
})
function Posts() {
  const {
    state: { data: posts },
  } = useLoaderInstance({
    key: 'posts',
  })
  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {posts?.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <Link
                to={postIdRoute.fullPath}
                params={{
                  postId: post.id,
                }}
                className="block py-1 text-blue-800 hover:text-blue-600"
                activeProps={{
                  className: 'text-black font-bold',
                }}
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
export { route }
