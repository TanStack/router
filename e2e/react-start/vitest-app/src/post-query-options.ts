import { queryOptions } from '@tanstack/react-query'
import { fetchPost } from './posts'

export const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['post', postId],
    queryFn: () => fetchPost({ data: postId }),
  })
