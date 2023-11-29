import * as React from 'react'
import { Link, Outlet, Route } from '@tanstack/react-router'
import { rootRoute } from './root'
import { postIdRoute } from './posts/$postId'

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

const fetchPosts = async () => {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  return fetch('https://jsonplaceholder.typicode.com/posts')
    .then((d) => d.json() as Promise<PostType[]>)
    .then((d) => d.slice(0, 10))
}

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: fetchPosts,
  component: function Posts({ useLoaderData }) {
    const posts = useLoaderData()

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
})
