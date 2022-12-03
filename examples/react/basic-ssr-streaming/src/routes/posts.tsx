import * as React from 'react'
import { Outlet, useMatch } from '@tanstack/react-router'
import { routeConfig } from '../routes.generated/posts'
import { PostType } from './posts/$postId'

routeConfig.generate({
  component: Posts,
  loader: async () => {
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
  const {
    loaderData: { posts },
    Link,
  } = useMatch(routeConfig.id)

  return (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
      }}
    >
      <div>
        {posts?.map((post) => {
          return (
            <div key={post.id}>
              <Link
                to="/posts/$postId"
                params={{
                  postId: post.id,
                }}
                activeProps={{ className: 'font-bold' }}
              >
                <pre>{post.title.substring(0, 20)}</pre>
              </Link>
            </div>
          )
        })}
      </div>
      <Outlet />
    </div>
  )
}
