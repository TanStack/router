import { queryOptions } from '@tanstack/react-query'
import { fetchPost } from './posts'
export const postQueryOptions = (postId) =>
  queryOptions({
    queryKey: ['posts', { postId }],
    queryFn: () => fetchPost(postId),
  })
