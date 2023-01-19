import { Outlet, useLoaderData, useMatch } from '@tanstack/react-router'
import * as React from 'react'

import { loaderDelayFn } from '../../utils'
import { rootRoute } from '../__root'

export const layoutRoute = rootRoute.createRoute({
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
  const { random } = useLoaderData({ from: layoutRoute.id })

  return (
    <div>
      <div>Layout</div>
      <div>Random #: {random}</div>
      <hr />
      <Outlet />
    </div>
  )
}
