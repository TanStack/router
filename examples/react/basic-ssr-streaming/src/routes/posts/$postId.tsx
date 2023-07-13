import { Loader } from '@tanstack/react-loaders'
import { Route } from '@tanstack/router'
import * as React from 'react'
// import { loaderClient } from '../../entry-client'
import { postsLoader, postsRoute, PostType } from '../posts'

export const postLoader = new Loader({
  fn: async (postId: string) => {
    console.log(`Fetching post with id ${postId}...`)

    await new Promise((r) =>
      setTimeout(r, 1000 + Math.round(Math.random() * 300)),
    )

    return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(
      (r) => r.json() as Promise<PostType>,
    )
  },
  onInvalidate: async () => {
    await postsLoader.invalidate()
  },
})

export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  loader: async ({ context, params: { postId }, preload }) => {
    const { postLoader } = context.loaderClient.loaders

    const instance = postLoader.getInstance({
      variables: postId,
    })

    await instance.load({
      preload,
    })

    return () => instance.useInstance()
  },
  component: function Post({ useLoader }) {
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
