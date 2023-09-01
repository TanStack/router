import * as React from 'react'
import {
  lazyRouteComponent,
  Link,
  Outlet,
  Route,
  useLoader,
} from '@tanstack/react-router'
import { rootRoute } from './root'
import { postIdRoute } from './posts/$postId'
import { import$, server$ } from '@tanstack/bling'

export type PostType = {
  id: string
  title: string
  body: string
}

export type CommentType = {
  id: string
  postId: string
  name: string
  email: string
  body: string
}

const fetchPosts = server$(async () => {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  return fetch('https://jsonplaceholder.typicode.com/posts')
    .then((d) => d.json() as Promise<PostType[]>)
    .then((d) => d.slice(0, 10))
})

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: () => fetchPosts(),
  gcMaxAge: 0,
  component: lazyRouteComponent(() =>
    import$({
      default: function Posts() {
        const posts = useLoader({ from: '/posts' })

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
      },
    }),
  ),
})
