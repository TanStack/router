import { Outlet, useMatch } from '@tanstack/react-router'
import * as React from 'react'
import { routeConfig } from '../routes.generated/layout'

import { loaderDelayFn } from '../utils'

routeConfig.generate({
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
