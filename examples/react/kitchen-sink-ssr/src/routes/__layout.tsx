import { routeConfig } from '../routes.generated/__layout'
import { Outlet, useLoaderData, useMatch } from '@tanstack/react-router'
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
  const { random } = useLoaderData({ from: routeConfig.id })

  return (
    <div>
      <div>Layout</div>
      <div>Random #: {random}</div>
      <hr />
      <Outlet />
    </div>
  )
}
