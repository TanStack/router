import * as React from 'react'
import { useLoader, useMatch } from '@tanstack/react-router'
import { routeConfig } from '../../routes.generated/posts/$postId'

export type PostType = {
  id: string
  title: string
  body: string
}

routeConfig.generate({
  component: Post,
  onLoad: async ({ params: { postId } }) => {
    console.log(`Fetching post with id ${postId}...`)

    await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

    const post = await fetch(
      `https://jsonplaceholder.typicode.com/posts/${postId}`,
    ).then((r) => r.json() as Promise<PostType>)

    return {
      post,
    }
  },
})

function Post() {
  const { post } = useLoader({ from: routeConfig.id })

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
