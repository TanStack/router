import { Loader, useLoaderInstance } from '@tanstack/solid-loaders'
import { Outlet, Route } from '@tanstack/solid-router'
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
  component: () => <LayoutWrapper />,
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
      <div>Random #: {random as number}</div>
      <hr />
      <Outlet />
    </div>
  )
}
