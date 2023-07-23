import { Route } from '@tanstack/router'

import { postsRoute } from '../posts'
import { z } from 'zod'
import { trpc } from '../../utils/trpc'

export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',

  loader: async ({ context: { ssg }, params }) => {
    const postId = z.coerce.number().parse(params.postId)
    await ssg.postById.prefetch(parseInt(params.postId, 10))

    return { postId }
  },
  component: function Post({ useLoader }) {
    const { postId } = useLoader()
    const { data: post } = trpc.postById.useQuery(postId)

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post?.title}</h4>
        <div className="text-sm">{post?.body}</div>
      </div>
    )
  },
})
