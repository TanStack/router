import { routeConfig } from '../routes.generated/__layout'
import { Outlet, useLoaderInstance, useMatch } from '@tanstack/router'
import * as React from 'react'
import { loaderDelayFn } from '../utils'

routeConfig.generate({
  component: LayoutWrapper,
  onLoad: async () => {
    return loaderDelayFn(() => {
      return {
        random: Math.random(),
      }
    })
  },
})

function LayoutWrapper() {
  const { random } = useLoaderInstance({ from: routeConfig.id })

  return (
    <div>
      <div>Layout</div>
      <div>Random #: {random}</div>
      <hr />
      <Outlet />
    </div>
  )
}
