import { FileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'

export const Route = new FileRoute('/posts').createRoute({
  loader: fetchPosts,
})
