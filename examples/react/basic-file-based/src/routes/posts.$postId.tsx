import * as React from 'react'
import { ErrorComponent, createFileRoute } from '@tanstack/react-router'
import { fetchPost } from '../posts'
import { useNavigate } from '../router'
import type { ErrorComponentProps } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => fetchPost(postId),
  errorComponent: PostErrorComponent as any,
  notFoundComponent: () => {
    return <p>Post not found</p>
  },
  component: PostComponent,
})

export function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}

function PostComponent() {
  const post = Route.useLoaderData()
  const navigate = useNavigate({ from: '/posts/$postId' })
  // typing does not work for Route.useNavigate:
  // const navigateFromRoute = Route.useNavigate({from: '????'})
  // navigateFromRoute({to: '?????'})

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
      <button onClick={() => navigate({ to: '/posts' })}>Back to Posts</button>
    </div>
  )
}
