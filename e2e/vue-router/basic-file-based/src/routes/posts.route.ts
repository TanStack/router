import { createFileRoute } from '@tanstack/vue-router'
import { fetchPosts } from '../posts'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
})
