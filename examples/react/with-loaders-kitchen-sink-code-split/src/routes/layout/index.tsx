import { Loader, useLoaderInstance } from '@tanstack/react-loaders'
import { Outlet, Route } from '@tanstack/router'
import * as React from 'react'
import { fetchRandomNumber } from '../../mockTodos'

import { rootRoute } from '../root'

export const randomIdLoader = new Loader({
  key: 'random',
  fn: fetchRandomNumber,
})

export const layoutRoute = new Route({
  getParentRoute: () => rootRoute,
  id: 'layout',
  loader: async ({ context: { loaderClient } }) => {
    await loaderClient.load({ key: 'random' })
  },
  component: function LayoutWrapper({ useLoader }) {
    const { data: randomId } = useLoaderInstance({ key: 'random' })

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
