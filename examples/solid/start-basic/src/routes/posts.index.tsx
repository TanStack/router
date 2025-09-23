import { createFileRoute } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/posts/')({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div>Select a post.</div>
}
