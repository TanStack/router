import { lazy } from '@tanstack/react-router'
import { routeConfig as parentRouteConfig } from '../posts'
import * as React from 'react'
import { useLoader, useMatch } from '@tanstack/react-router'
export type PostType = {
  id: string
  title: string
  body: string
}
export const tanner = 'foo'
const routeConfig = parentRouteConfig.createRoute({
  path: '$postId',
  component: Post,
  onLoad: (...args) =>
    import('./$postId-loader').then((d) =>
      d.loader.apply(d.loader, args as any),
    ),
})
function Post() {
  const { post } = useLoader({
    from: routeConfig.id,
  })
  return (
    <div>
      <h4>{post.title}</h4>
      <p>{post.body}</p>
    </div>
  )
}
export { routeConfig }
