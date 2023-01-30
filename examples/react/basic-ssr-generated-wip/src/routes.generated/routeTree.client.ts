import type { __GeneratedRouteConfig } from './routeTree'

import { route as rootRoute } from './__root.client'
import { route as indexRoute } from './index.client'
import { route as postsRoute } from './posts.client'
import { route as postsIndexRoute } from './posts/index.client'
import { route as postspostIdRoute } from './posts/$postId.client'

export const routeTreeClient = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([
    postsIndexRoute,
    postspostIdRoute
  ])
]) as __GeneratedRouteConfig