import * as React from 'react'
import { Link, Outlet, useMatch } from '@tanstack/react-router'
import { routeConfig } from '../routes.generated/posts'
import { PostType } from './posts/$postId'
import { postspostIdRoute } from '../routes.generated/posts/$postId.client'

routeConfig.generate({
  component: Posts,
  onLoad: async () => {
    return {
      posts: await fetchPosts(),
    }
  },
  errorComponent: () => 'Oh crap',
})

async function fetchPosts() {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 300 + Math.round(Math.random() * 300)))
  return fetch('https://jsonplaceholder.typicode.com/posts')
    .then((d) => d.json() as Promise<PostType[]>)
    .then((d) => d.slice(0, 10))
}

function Posts() {
  const { posts } = useLoader({ from: routeConfig.id })

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {posts?.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <Link
                to={postspostIdRoute.id}
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
