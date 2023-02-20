import { Loader, useLoader } from '@tanstack/react-loaders'
import { Outlet, Route } from '@tanstack/router'
import * as React from 'react'
import { fetchRandomNumber } from '../../mockTodos'

import { loaderDelayFn } from '../../utils'
import { rootRoute } from '../__root'

export const randomIdLoader = new Loader({
  key: 'random',
  loader: () => {
    return fetchRandomNumber()
  },
})

export const layoutRoute = new Route({
  getParentRoute: () => rootRoute,
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
  const loaderInstance = useLoader({ key: randomIdLoader.key })
  const random = loaderInstance.state.data

  return (
    <div>
      <div>Layout</div>
      <div>Random #: {random}</div>
      <hr />
      <Outlet />
    </div>
  )
}
