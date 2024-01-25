import { createFileRoute } from '@tanstack/react-router'
import { fetchPost } from '../../posts'

export const Route = createFileRoute('/posts/$postId')({
  loaderDeps: () => ({
    test: 'tanner' as const,
  }),
  loader: async ({
    params: { postId },
    deps: { test },
    //      ^?
  }) => {
    return fetchPost(postId)
  },
})
