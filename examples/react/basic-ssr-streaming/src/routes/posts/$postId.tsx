import { useLoaderInstance } from '@tanstack/react-loaders'
import { Route, useParams } from '@tanstack/router'
import * as React from 'react'
// import { loaderClient } from '../../entry-client'
import { postsRoute } from '../posts'

export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  component: Post,
  onLoad: async ({ params: { postId }, preload, context }) =>
    context.loaderClient.getLoader({ key: 'post' }).load({
      variables: postId,
      preload,
    }),
})

function Post() {
  const { postId } = useParams({ from: postIdRoute.id })
  const {
    state: { data: post },
  } = useLoaderInstance({ key: 'post', variables: postId })

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
