import { createFileRoute } from '@tanstack/solid-router'
import { postQueryOptions } from '@router-solid-mono-solid-query/post-query'

export const Route = createFileRoute('/$postId')({
  loader: ({ context: { queryClient }, params: { postId } }) => {
    return queryClient.query({
      ...postQueryOptions(postId),
      staleTime: 'static',
    })
  },
})
