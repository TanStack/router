import { lazyRouteComponent, Route } from '@tanstack/router'
import { rootRoute } from '../root/rootRoute'

export const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./Index'), 'Index'),
})
