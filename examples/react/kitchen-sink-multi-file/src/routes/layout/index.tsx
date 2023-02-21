import { Loader } from '@tanstack/react-loaders'
import { Outlet, Route } from '@tanstack/router'
import * as React from 'react'
import { fetchRandomNumber } from '../../mockTodos'

import { rootRoute } from '../root'

export const randomIdLoader = new Loader({
  fn: fetchRandomNumber,
})

export const layoutRoute = new Route({
  getParentRoute: () => rootRoute,
  id: 'layout',
  loader: async ({ context }) => {
    const { randomIdLoader } = context.loaderClient.loaders
    await randomIdLoader.load()
    return () => randomIdLoader.useLoader()
  },
  component: function LayoutWrapper({ useLoader }) {
    const {
      state: { data: randomId },
    } = useLoader()()

    return (
      <div>
        <div>Layout</div>
        <div>Random #: {randomId}</div>
        <hr />
        <Outlet />
      </div>
    )
  },
})
