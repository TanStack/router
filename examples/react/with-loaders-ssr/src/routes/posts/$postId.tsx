import {
  createLoaderOptions,
  Loader,
  typedClient,
  useLoaderInstance,
} from '@tanstack/react-loaders'
import { Route } from '@tanstack/router'
import * as React from 'react'
// import { loaderClient } from '../../entry-client'
import { postsRoute, PostType } from '../posts'

export const postLoader = new Loader({
  key: 'post',
  fn: async (postId: string) => {
    console.log(`Fetching post with id ${postId}...`)

    await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

    return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(
      (r) => r.json() as Promise<PostType>,
    )
  },
  onInvalidate: async ({ client }) => {
    await typedClient(client).invalidateLoader({ key: 'posts' })
  },
})

export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  getContext: ({ params: { postId } }) => {
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
    preload,
  }) => {
    await loaderClient.load({
      ...loaderOptions,
      preload,
    })
  },
  component: function Post({ useRouteContext }) {
    const { loaderOptions } = useRouteContext()
    const { data: post } = useLoaderInstance(loaderOptions)

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    )
  },
})
