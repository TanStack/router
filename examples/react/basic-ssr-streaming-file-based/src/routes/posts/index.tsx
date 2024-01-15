import { FileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = new FileRoute('/posts/').createRoute({
  component: PostsIndexComponent,
  loader: async () => {
    throw new Error('Asd')
  },
  wrapInSuspense: true,
  pendingComponent: () => {
    return <p>Pending</p>
  },
  errorComponent: ({ error }) => {
    return (
      <div>
        <h1>Something went wrong</h1>
      </div>
    )
  },
})

function PostsIndexComponent() {
  return <div>Select a post.</div>
}
