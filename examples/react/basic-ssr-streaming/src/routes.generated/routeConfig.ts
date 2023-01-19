import { routeConfig as rootRoute } from './__root'
import { routeConfig as indexRoute } from './index'
import { routeConfig as postsRoute } from './posts'
import { routeConfig as postsIndexRoute } from './posts/index'
import { routeConfig as postspostIdRoute } from './posts/$postId'

export const routeConfig = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([
    postsIndexRoute,
    postspostIdRoute
  ])
])
export type __GeneratedRouteConfig = typeof routeConfig