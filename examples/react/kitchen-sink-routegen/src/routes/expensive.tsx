import { createRouteConfig } from '@tanstack/react-router'
import { loaderDelayFn } from '../utils'

export default createRouteConfig().createRoute({
  // Your elements can be asynchronous, which means you can code-split!
  path: 'expensive',
  element: () => loaderDelayFn(() => import('../components/Expensive')),
})
