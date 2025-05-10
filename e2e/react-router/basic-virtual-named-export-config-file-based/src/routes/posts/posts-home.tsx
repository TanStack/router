import * as React from 'react'

export const Route = createFileRoute({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div>Select a post.</div>
}
