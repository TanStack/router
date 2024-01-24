import * as React from 'react'
import {
  ErrorComponent,
  ErrorComponentProps,
  Link,
  createLazyFileRoute,
} from '@tanstack/react-router'
import { PostNotFoundError } from '../../posts'

export const Route = createLazyFileRoute('/posts/$postId')({
  component: PostComponent,
  errorComponent: PostErrorComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()
  //    ^?

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

export function PostErrorComponent({ error }: ErrorComponentProps) {
  if (error instanceof PostNotFoundError) {
    return <div>{error.message}</div>
  }

  return <ErrorComponent error={error} />
}
