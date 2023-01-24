import { lazy, Route } from '@tanstack/react-router'
import { loaderDelayFn } from '../../utils'
import { rootRoute } from '../__root'

export const expensiveRoute = new Route({
  getParentRoute: () => rootRoute,
  // Your elements can be asynchronous, which means you can code-split!
  path: 'expensive',
  component: lazy(() => import('./Expensive')),
})
