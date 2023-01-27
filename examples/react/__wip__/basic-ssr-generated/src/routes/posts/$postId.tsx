import { useLoaderInstance } from '@tanstack/react-loaders'
import { useParams } from '@tanstack/react-router'
import * as React from 'react'
import { routeConfig } from '../../routes.generated/posts/$postId'

routeConfig.generate({
  component: Post,
  onLoad: async ({ params: { postId }, preload, context }) =>
    context.loaderClient.getLoader('post').load({
      variables: postId,
      preload,
    }),
})

function Post() {
  const { postId } = useParams({ from: routeConfig.id })
  const { post } = useLoaderInstance({ key: 'post', variables: postId })

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
