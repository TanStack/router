import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({
  component: PostsIndexComponent,
  // // uncomment one of the next lines to fix the issue
  // beforeLoad: () => {},
  // loader: () => {}
})

function PostsIndexComponent() {
  return <div>Select a post.</div>
}
