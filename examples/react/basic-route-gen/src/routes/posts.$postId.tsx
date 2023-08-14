import * as React from 'react'
import { ErrorComponent, FileRoute } from '@tanstack/react-router'
import axios from 'axios'

export type PostType = {
  id: string
  title: string
  body: string
}

class NotFoundError extends Error {}

const fetchPost = async (postId: string) => {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))
  const post = await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data)

  if (!post) {
    throw new NotFoundError(`Post with id "${postId}" not found!`)
  }

  return post
}

// 'posts/$postId' is automatically inserted and managed
// by the `tsr generate/watch` CLI command
export const route = new FileRoute('posts/$postId').createRoute({
  loader: async ({ params: { postId } }) => fetchPost(postId),
  errorComponent: ({ error }) => {
    if (error instanceof NotFoundError) {
      return <div>{error.message}</div>
    }

    return <ErrorComponent error={error} />
  },
  component: ({ useLoader }) => {
    const post = useLoader()

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    )
  },
})
