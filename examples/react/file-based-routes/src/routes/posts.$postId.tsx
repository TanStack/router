import * as React from 'react'
import {
  ErrorComponent,
  FileRoute,
  Link,
  RouteErrorComponentProps,
} from '@tanstack/react-router'
import axios from 'axios'

export type PostType = {
  id: string
  title: string
  body: string
}

export class PostNotFoundError extends Error {}

export const fetchPost = async (postId: string) => {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))
  const post = await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data)

  if (!post) {
    throw new PostNotFoundError(`Post with id "${postId}" not found!`)
  }

  return post
}

// 'posts/$postId' is automatically inserted and managed
// by the `tsr generate/watch` CLI command
export const route = new FileRoute('/posts/$postId').createRoute({
  loader: async ({ params: { postId } }) => fetchPost(postId),
  errorComponent: PostErrorComponent as any,
  component: PostComponent,
})

export function PostErrorComponent({ error }: RouteErrorComponentProps) {
  if (error instanceof PostNotFoundError) {
    return <div>{error.message}</div>
  }

  return <ErrorComponent error={error} />
}

export function PostComponent() {
  const post = route.useLoader()

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
      <Link
        to="/posts/$postId/deep"
        params={{
          postId: post.id,
        }}
        activeProps={{ className: 'text-black font-bold' }}
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        Deep View
      </Link>
    </div>
  )
}
