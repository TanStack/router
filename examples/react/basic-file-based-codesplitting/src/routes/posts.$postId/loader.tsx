import { FileRouteLoader } from '@tanstack/react-router'
import { fetchPost } from '../../posts'

export const loader = FileRouteLoader('/posts/$postId')(async ({
  params: { postId },
  deps: { test },
  //      ^?
}) => {
  return fetchPost(postId)
})
