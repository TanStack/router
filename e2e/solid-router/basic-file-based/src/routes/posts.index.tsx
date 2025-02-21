import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/posts/')({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div data-testid="PostsIndexComponent">Select a post.</div>
}
