import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'

// a function the compiler can see: split without the object-form mark
const loadPosts = async () => fetchPosts()

export const Route = createFileRoute('/posts')({
  loader: loadPosts,
  component: () => <p>posts</p>,
})
