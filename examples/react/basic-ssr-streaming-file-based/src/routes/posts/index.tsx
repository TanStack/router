import { FileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = new FileRoute('/posts/').createRoute({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div>Select a post.</div>
}
