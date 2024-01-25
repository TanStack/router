import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { PostType } from '../posts'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    console.log(`Fetching post with id ${params.postId}...`)

    await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

    return fetch(
      `https://jsonplaceholder.typicode.com/posts/${params.postId}`,
    ).then((r) => r.json() as Promise<PostType>)
  },
  component: PostComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
