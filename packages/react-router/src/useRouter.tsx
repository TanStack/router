import * as React from 'react'
import warning from 'tiny-warning'
import { AnyRoute } from './route'
import { RegisteredRouter, Router } from './router'
import { getRouterContext } from './routerContext'

export function useRouter<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
>(opts?: { warn?: boolean }): Router<TRouteTree> {
  const value = React.useContext(getRouterContext())
  warning(
    !((opts?.warn ?? true) && !value),
    'useRouter must be used inside a <RouterProvider> component!',
  )
  return value as any
}
