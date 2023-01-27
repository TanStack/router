import { lazy } from '@tanstack/react-router'
import { routeConfig as parentRouteConfig } from '../posts'
import * as React from 'react'
import { useLoaderInstance, useMatch } from '@tanstack/react-router'
export type PostType = {
  id: string
  title: string
  body: string
}
const routeConfig = new Route({
  getParentRoute: () => parentRouteConfig,
  path: '$postId',
  component: Post,
  onLoad: (...args) =>
    import('./$postId-loader').then((d) =>
      d.loader.apply(d.loader, args as any),
    ),
})
function Post() {
  const { post } = useLoaderInstance({
    from: routeConfig.id,
  })
  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
export { routeConfig }
