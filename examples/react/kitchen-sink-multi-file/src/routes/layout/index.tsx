import { Loader, useLoaderInstance } from '@tanstack/react-loaders'
import { Outlet } from '@tanstack/react-router'
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
  const loaderInstance = useLoaderInstance({ key: randomIdLoader.key })
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
