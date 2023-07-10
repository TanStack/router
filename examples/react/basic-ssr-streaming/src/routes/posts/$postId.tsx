import { useLoader } from '@tanstack/react-loaders'
import { Route, RouteComponent, useParams } from '@tanstack/router'
import * as React from 'react'
// import { loaderClient } from '../../entry-client'
import { postsRoute } from '../posts'

export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  loader: async ({
    context: { loaderClient },
    params: { postId },
    preload,
  }) => {
    const { postLoader } = loaderClient.loaders

    await postLoader.load({
      variables: postId,
      preload,
    })

    // Return a curried hook!
    return () =>
      useLoader({
        loader: postLoader,
        variables: postId,
      })
  },
  component: ({ useLoader }) => {
    const {
      state: { data: post },
    } = useLoader()()

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    )
  },
})
