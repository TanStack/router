import * as React from 'react'
import warning from 'tiny-warning'
import { getRouterContext } from './routerContext'
import type { AnyRoute } from './route'
import type { RegisteredRouter, Router } from './router'

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
