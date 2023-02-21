import * as React from 'react'
import { Link, Outlet, Route } from '@tanstack/router'
import { rootRoute } from './root'
// import { loaderClient } from '../entry-client'
import { Loader, useLoader } from '@tanstack/react-loaders'
import { postIdRoute } from './posts/$postId'

export type PostType = {
  id: string
  title: string
  body: string
}

export const postsLoader = new Loader({
  fn: async () => {
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
  getContext: ({ context }) => {
    const { postsLoader } = context.loaderClient.loaders

    return {
      postsLoader,
      getTitle: () => {
        const postsCount = postsLoader.getInstance().state.data?.length

        return `Posts (${postsCount})`
      },
    }
  },
  loader: async ({ context, preload }) => {
    await context.postsLoader.load({ preload })
    return () => context.postsLoader.useLoader()
  },
  errorComponent: () => 'Oh crap',
  component: function Posts({ useLoader }) {
    const {
      state: { data: posts },
    } = useLoader()()

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
  },
})
