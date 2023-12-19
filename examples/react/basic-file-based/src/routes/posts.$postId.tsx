import * as React from 'react'
import {
  ErrorComponent,
  FileRoute,
  Link,
  ErrorRouteProps,
} from '@tanstack/react-router'
import { fetchPost, PostNotFoundError } from '../posts'

export const Route = new FileRoute('/posts/$postId').createRoute({
  loader: async ({ params: { postId } }) => fetchPost(postId),
  errorComponent: PostErrorComponent as any,
  component: PostComponent,
})

export function PostErrorComponent({ error }: ErrorRouteProps) {
  if (error instanceof PostNotFoundError) {
    return <div>{error.message}</div>
  }

  return <ErrorComponent error={error} />
}

function PostComponent() {
  const post = Route.useLoaderData()

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
