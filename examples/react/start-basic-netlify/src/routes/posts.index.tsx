import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({
  component: PostsIndexComponent,
})

/**
 * Renders a placeholder prompting the user to select a post.
 *
 * @returns A JSX element containing the text "Select a post."
 */
function PostsIndexComponent() {
  return <div>Select a post.</div>
}
