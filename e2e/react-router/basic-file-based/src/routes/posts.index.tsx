import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div data-testid="PostsIndexComponent">Select a post.</div>
}
