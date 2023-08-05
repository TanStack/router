import * as React from 'react'
import { createLoaderOptions, useLoaderInstance } from '@tanstack/react-loaders'
import { ErrorComponent, lazyRouteComponent, Route } from '@tanstack/router'
import { NotFoundError } from '../../../loaderClient'
import { postsRoute } from '../postsRoute'

export const postRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  loader: async ({ context: { loaderClient }, params: { postId } }) => {
    const loaderOptions = createLoaderOptions({
      key: 'post',
      variables: postId,
    })

    await loaderClient.load(loaderOptions)

    // Return a curried hook!
    return () => useLoaderInstance(loaderOptions)
  },
  errorComponent: ({ error }) => {
    if (error instanceof NotFoundError) {
      return <div>{error.message}</div>
    }

    return <ErrorComponent error={error} />
  },
}).update({
  component: lazyRouteComponent(() => import('./Post'), 'Posts'),
})
