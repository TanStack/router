import * as Solid from 'react'
import warning from 'tiny-warning'
import { getRouterContext } from './routerContext'
import type { AnyRouter, RegisteredRouter } from './router'

export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(opts?: {
  warn?: boolean
}): TRouter {
  const value = Solid.useContext(getRouterContext())
  warning(
    !((opts?.warn ?? true) && !value),
    'useRouter must be used inside a <RouterProvider> component!',
  )
  return value as any
}
