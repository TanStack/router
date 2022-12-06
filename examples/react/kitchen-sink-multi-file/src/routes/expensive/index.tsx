import { lazy } from '@tanstack/react-router'
import { loaderDelayFn } from '../../utils'
import { rootRoute } from '../__root'

export const expensiveRoute = rootRoute.createRoute({
  // Your elements can be asynchronous, which means you can code-split!
  path: 'expensive',
  component: lazy(() => loaderDelayFn(() => import('./Expensive'))),
})
