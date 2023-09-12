import * as React from 'react'
import { createLoaderOptions, useLoaderInstance } from '@tanstack/react-loaders'
import {
  ErrorComponent,
  lazyRouteComponent,
  Route,
} from '@tanstack/react-router'
import { NotFoundError } from '../../../loaderClient'
import { postsRoute } from '../postsRoute'

export const postRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  beforeLoad: ({ params: { postId } }) => {
    const loaderOptions = createLoaderOptions({
      key: 'post',
      variables: postId,
    })

    return {
      loaderOptions,
    }
  },
  loader: async ({
    context: { loaderClient },
    routeContext: { loaderOptions },
  }) => {
    await loaderClient.load(loaderOptions)
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
