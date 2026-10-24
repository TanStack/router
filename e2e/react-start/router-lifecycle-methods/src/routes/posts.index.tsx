import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return (
    <div data-testid="posts-index-component">
      <p data-testid="posts-index-text">Select a post from the list above.</p>
    </div>
  )
}
