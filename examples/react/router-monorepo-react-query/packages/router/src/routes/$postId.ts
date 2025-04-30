
import { postQueryOptions } from '@router-mono-react-query/post-query'

export const Route = createFileRoute({
  loader: ({ context: { queryClient }, params: { postId } }) => {
    return queryClient.ensureQueryData(postQueryOptions(postId))
  },
})
