import * as React from 'react'
import warning from 'tiny-warning'
import { AnyRoute } from './route'
import { RegisteredRouter, Router } from './router'
import { routerContext } from './routerContext'

export function useRouter<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
>(opts?: { warn?: boolean }): Router<TRouteTree> {
  const resolvedContext =
    typeof document !== 'undefined'
      ? window.__TSR_ROUTER_CONTEXT__ || routerContext
      : routerContext
  const value = React.useContext(resolvedContext)
  warning(
    !((opts?.warn ?? true) && !value),
    'useRouter must be used inside a <RouterProvider> component!',
  )
  return value as any
}
