import * as React from 'react'
import { useLoaderData, useMatch } from '@tanstack/react-router'
import { routeConfig } from '../../routes.generated/posts/$postId'

export type PostType = {
  id: string
  title: string
  body: string
}

export const tanner = 'foo'

routeConfig.generate({
  component: Post,
  loader: async ({ params: { postId } }) => {
    return {
      post: await fetchPostById(postId),
    }
  },
})

async function fetchPostById(postId: string) {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

  return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(
    (r) => r.json() as Promise<PostType>,
  )
}

function Post() {
  const { post } = useLoaderData({ from: routeConfig.id })

  return (
    <div>
      <h4>{post.title}</h4>
      <p>{post.body}</p>
    </div>
  )
}
