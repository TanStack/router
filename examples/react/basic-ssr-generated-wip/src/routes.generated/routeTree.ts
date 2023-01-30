import { route as rootRoute } from './__root'
import { route as indexRoute } from './index'
import { route as postsRoute } from './posts'
import { route as postsIndexRoute } from './posts/index'
import { route as postspostIdRoute } from './posts/$postId'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([
    postsIndexRoute,
    postspostIdRoute
  ])
])
export type __GeneratedRouteConfig = typeof routeTree