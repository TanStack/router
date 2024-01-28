import React from 'react'

import { createLazyFileRoute } from '@tanstack/react-router'
import { trpc } from '../../../utils/trpc'
import Spinner from '../../../components/Spinner'

export const Route = createLazyFileRoute('/posts/$postId')({
  component: PostsComponent,
})

function PostsComponent() {
  const { postData, postId } = Route.useLoaderData()

  const { data, isPending } = trpc.post.useQuery(postId, {
    initialData: postData,
  })

  if (isPending) {
    return <Spinner />
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">
        {data?.id} - {data?.title}
      </h4>
    </div>
  )
}
