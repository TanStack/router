import { useQuery } from '@tanstack/react-query'
import { postQueryOptions } from '../post-query-options'

export function PostTitle({ postId }: { postId: string }) {
  const { data: post } = useQuery(postQueryOptions(postId))

  return <h1>{post ? post.title : 'Loading...'}</h1>
}
