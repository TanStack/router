import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

// @ts-ignore
export const Route = new FileRoute('/posts/').createRoute({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div>Select a post.</div>
}
