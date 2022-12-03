import type { __GeneratedRouteConfig } from './routeConfig'

import { rootRoute } from './__root.client'
import { indexRoute } from './index.client'
import { postsRoute } from './posts.client'
import { postsIndexRoute } from './posts/index.client'
import { postspostIdRoute } from './posts/$postId.client'

export const routeConfigClient = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([
    postsIndexRoute,
    postspostIdRoute
  ])
]) as __GeneratedRouteConfig