import { lazyRouteComponent, Route } from '@tanstack/react-router'
import { rootRoute } from '../root/rootRoute'

export const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./Index'), 'Index'),
})
