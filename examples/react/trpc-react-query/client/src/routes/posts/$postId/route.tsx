import { createFileRoute } from '@tanstack/react-router'
import { apiUtils } from '../../../utils/trpc'
import { z } from 'zod'

export const Route = createFileRoute('/posts/$postId')({
  parseParams: (params) => ({
    postId: z.string().parse(params.postId),
  }),
  loader: async ({ params: { postId } }) => {
    const postData = await apiUtils.post.ensureData(postId)
    return {
      postData,
      postId,
    }
  },
})
