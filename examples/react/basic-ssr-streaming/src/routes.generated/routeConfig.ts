import { rootRoute } from './__root'
import { indexRoute } from './index'
import { postsRoute } from './posts'
import { postsIndexRoute } from './posts/index'
import { postspostIdRoute } from './posts/$postId'

export const routeConfig = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([
    postsIndexRoute,
    postspostIdRoute
  ])
])
export type __GeneratedRouteConfig = typeof routeConfig