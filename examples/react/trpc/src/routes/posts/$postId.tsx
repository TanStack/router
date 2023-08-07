import { Route } from '@tanstack/router'

import { postsRoute } from '../posts'
import { z } from 'zod'
import { trpc } from '../../utils/trpc'
import { Suspense } from 'react'

export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',

  loader: async ({ context: { ssg }, params: { postId } }) => {
    const id = z.coerce.number().parse(postId)
    await ssg.postById.prefetch(id)

    return { postId: id }
  },
  component: function Post({ useLoader }) {
    const { postId } = useLoader()
    const { data: post } = trpc.postById.useQuery(postId)

    if (!post) /** should never happen */ return null

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
        <h5 className="m-2">Comments</h5>
        {post.commentIds.map((id) => (
          <Suspense key={id} fallback={<div>Loading Comment {id}...</div>}>
            <Comment id={id} />
          </Suspense>
        ))}
      </div>
    )
  },
})

function Comment({ id }: { id: number }) {
  const [comment] = trpc.commentById.useSuspenseQuery(id)

  return (
    <div className="text-xs">
      <div>{comment.body}</div>
    </div>
  )
}
