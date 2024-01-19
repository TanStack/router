import { FileRoute } from '@tanstack/react-router'
import { apiUtils } from '../../../utils/trpc'
import { z } from 'zod'

export const Route = new FileRoute('/posts/$postId').createRoute({
  parseParams: (params) => ({
    postId: z.string().parse(params.postId),
  }),
  stringifyParams: ({ postId }) => ({ postId: `${postId}` }),
  loader: async ({ params: { postId } }) => {
    const postData = await apiUtils.post.ensureData(postId)
    return {
      postData,
      postId,
    }
  },
})
