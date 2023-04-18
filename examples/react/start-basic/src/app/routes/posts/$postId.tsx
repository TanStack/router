import { fetch$, json } from '@tanstack/bling'
import { Loader } from '@tanstack/react-loaders'
import { Route } from '@tanstack/router'

import { postsLoader, postsRoute, PostType } from '../posts'

export const postLoader = new Loader({
  fn: fetch$(
    async (postId: string) => {
      console.log(`Fetching post with id ${postId}...`)

      await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

      const res = await fetch(
        `https://jsonplaceholder.typicode.com/posts/${postId}`,
      ).then((r) => r.json() as Promise<PostType>)

      return json(res, {
        headers: {
          'Cache-Control': 'public, max-age=10',
        },
      })
    },
    {
      method: 'GET',
    },
  ),
  onInvalidate: async () => {
    await postsLoader.invalidate()
  },
})

export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  getContext: ({ context, params: { postId } }) => {
    const { postLoader } = context.loaderClient.loaders
    const postLoaderInstance = postLoader.getInstance({ variables: postId })
    return {
      postLoaderInstance,
      getTitle: () => postLoaderInstance.state.data?.title,
    }
  },
  loader: async ({ preload, context: { postLoaderInstance } }) => {
    await postLoaderInstance.load({ preload })
    return () => postLoaderInstance.useInstance()
  },
  component: function Post({ useLoader }) {
    const {
      state: { data: post },
    } = useLoader()()

    console.log('post', post)

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    )
  },
})
