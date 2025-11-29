import { createFileRoute } from '@tanstack/vue-router'
import { fetchPost } from '../posts'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => fetchPost(params.postId),
})
