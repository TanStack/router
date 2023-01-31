import { Route } from '../../routes.generated/posts/$postId'
import { Loader, useLoaderInstance } from '@tanstack/react-loaders'
import { Route, useParams } from '@tanstack/react-router'
import * as React from 'react'
import { postsLoader, postsRoute } from '../posts'
export type PostType = {
  id: string
  title: string
  body: string
}
export const postLoader = new Loader({
  key: 'post',
  loader: async (postId: string) => {
    console.log(`Fetching post with id ${postId}...`)
    await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))
    return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(
      (r) => r.json() as Promise<PostType>,
    )
  },
  onAllInvalidate: async () => {
    await postsLoader.invalidateAll()
  },
})
export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  component: Post,
  onLoad: async ({ params: { postId }, preload, context }) =>
    context.loaderClient
      .getLoader({
        key: 'post',
      })
      .load({
        variables: postId,
        preload,
      }),
})
function Post() {
  const { postId } = useParams({
    from: postIdRoute.id,
  })
  const {
    state: { data: post },
  } = useLoaderInstance({
    key: 'post',
    variables: postId,
  })
  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
