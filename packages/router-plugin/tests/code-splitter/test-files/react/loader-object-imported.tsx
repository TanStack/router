import { createFileRoute } from '@tanstack/react-router'
import { loadPosts } from '../posts'

export const Route = createFileRoute('/posts')({
  loader: { handler: loadPosts, staleReloadMode: 'background' },
  component: () => <div>posts</div>,
})
