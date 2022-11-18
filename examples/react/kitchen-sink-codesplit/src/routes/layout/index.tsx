import { createRouteConfig, Outlet, useMatch } from '@tanstack/react-router'
import * as React from 'react'

import { loaderDelayFn } from '../../utils'

export const layoutRoute = createRouteConfig().createRoute({
  id: 'layout',
  component: LayoutWrapper,
  loader: async () => {
    return loaderDelayFn(() => {
      return {
        random: Math.random(),
      }
    })
  },
})

function LayoutWrapper() {
  const { loaderData } = useMatch(layoutRoute.id)
  return (
    <div>
      <div>Layout</div>
      <div>Random #: {loaderData.random}</div>
      <hr />
      <Outlet />
    </div>
  )
}
