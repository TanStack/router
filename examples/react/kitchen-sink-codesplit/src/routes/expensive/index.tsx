import { createRouteConfig } from '@tanstack/react-router'
import * as React from 'react'
import { loaderDelayFn } from '../../utils'

export const expensiveRoute = createRouteConfig().createRoute({
  // Your elements can be asynchronous, which means you can code-split!
  path: 'expensive',
  element: () =>
    loaderDelayFn(() => import('./Expensive')).then((res) => <res.Expensive />),
})
