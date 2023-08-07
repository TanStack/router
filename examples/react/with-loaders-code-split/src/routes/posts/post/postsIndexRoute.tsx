import { lazyRouteComponent, Route } from '@tanstack/router'
import { postsRoute } from '../postsRoute'

export const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./PostsIndex'), 'PostsIndex'),
})
