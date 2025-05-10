import * as React from 'react'

export const Route = createFileRoute({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div data-testid="PostsIndexComponent">Select a post.</div>
}
