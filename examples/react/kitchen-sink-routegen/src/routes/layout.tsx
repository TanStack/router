import { createRouteConfig, Outlet, useMatch } from '@tanstack/react-router'
import * as React from 'react'

import { loaderDelayFn } from '../utils'

const routeConfig = createRouteConfig().createRoute({
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

export default routeConfig

function LayoutWrapper() {
  const { loaderData } = useMatch(routeConfig.id)
  return (
    <div>
      <div>Layout</div>
      <div>Random #: {loaderData.random}</div>
      <hr />
      <Outlet />
    </div>
  )
}
