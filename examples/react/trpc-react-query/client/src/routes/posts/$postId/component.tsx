import React from 'react'

import { RouteApi } from '@tanstack/react-router'
import { trpc } from '../../../utils/trpc'
import Spinner from '../../../components/Spinner'

const api = new RouteApi({ id: '/posts/$postId' })

export const component = function PostsComponent() {
  const { postData, postId } = api.useLoaderData()

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
