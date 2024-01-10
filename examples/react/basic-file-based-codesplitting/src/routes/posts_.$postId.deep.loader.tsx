import { FileRouteLoader } from '@tanstack/react-router'
import { fetchPost } from '../posts'

export const loader = FileRouteLoader('/posts/$postId/deep')(
  async ({ params: { postId } }) => fetchPost(postId),
)
