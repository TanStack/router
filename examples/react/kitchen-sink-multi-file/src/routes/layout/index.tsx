import { Outlet, useLoader, useMatch } from '@tanstack/react-router'
import * as React from 'react'

import { loaderDelayFn } from '../../utils'
import { rootRoute } from '../__root'

export const layoutRoute = rootRoute.createRoute({
  id: 'layout',
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
  const { random } = useLoader({ from: layoutRoute.id })

  return (
    <div>
      <div>Layout</div>
      <div>Random #: {random}</div>
      <hr />
      <Outlet />
    </div>
  )
}
