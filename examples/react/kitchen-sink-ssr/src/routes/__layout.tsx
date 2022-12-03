import { routeConfig } from '../routes.generated/__layout'
import { Outlet, useMatch } from '@tanstack/react-router'
import * as React from 'react'
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
