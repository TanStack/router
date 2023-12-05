import { Route } from '@tanstack/react-router'
import * as React from 'react'
// import { loaderClient } from '../../entry-client'
import { postsLoader, postsRoute, PostType } from '../posts'

export const postLoader = new Loader({
  key: 'post',
  fn: async (postId: string) => {
    console.log(`Fetching post with id ${postId}...`)

    await new Promise((r) =>
      setTimeout(r, 1000 + Math.round(Math.random() * 300)),
    )

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
  beforeLoad: ({ params: { postId } }) => ({
    loaderOpts: createLoaderOptions({ key: 'post', variables: postId }),
  }),
  loader: async ({ context: { loaderClient, loaderOpts }, preload }) =>
    loaderClient.load({
      ...loaderOpts,
      preload,
    }),
  component: function Post({ useContext }) {
    const { loaderOpts } = useContext()
    const { data: post } = useLoaderInstance(loaderOpts)

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    )
  },
})
