import { FileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = new FileRoute('/posts/').createRoute({
  component: PostsIndexComponent,
  wrapInSuspense: true,
  errorComponent: ({ error }) => {
    return (
      <div className="text-red-500">Failed to load post: {error.message}</div>
    )
  },
})

function PostsIndexComponent() {
  return <div>Select a post.</div>
}
