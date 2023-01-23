import * as React from 'react'
import { useLoaderInstance, useMatch } from '@tanstack/react-router'
import { routeConfig } from '../../routes.generated/posts/$postId'
export type PostType = {
  id: string
  title: string
  body: string
}
export const tanner = 'foo'
function Post() {
  const { post } = useLoaderInstance({
    from: routeConfig.id,
  })
  return (
    <div>
      <h4>{post.title}</h4>
      <p>{post.body}</p>
    </div>
  )
}
export const component = Post
