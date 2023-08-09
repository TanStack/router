import { lazyRouteComponent, Route } from '@tanstack/react-router'
import { rootRoute } from '../root'

export const expensiveRoute = new Route({
  getParentRoute: () => rootRoute,
  // Your elements can be asynchronous, which means you can code-split!
  path: 'expensive',
  component: lazyRouteComponent(() => import('./Expensive')),
})
