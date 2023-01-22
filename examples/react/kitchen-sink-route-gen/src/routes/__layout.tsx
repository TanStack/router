import { routeConfig } from '../routes.generated/__layout'
import { Outlet, useLoader, useMatch } from '@tanstack/react-router'
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
  const { random } = useLoader({ from: routeConfig.id })

  return (
    <div>
      <div>Layout</div>
      <div>Random #: {random}</div>
      <hr />
      <Outlet />
    </div>
  )
}
