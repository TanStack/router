import * as Solid from 'solid-js'
import { routerContext } from './routerContext'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RegisteredRouterOf,
} from '@tanstack/router-core'

/**
 * The signature of `useRouter`, typed against the router of `TDefaultRegister` unless a router
 * type is passed explicitly. Route modules export a `useRouter` of this type.
 */
export type UseRouterFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
>(opts?: {
  warn?: boolean
}) => TRouter

export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(opts?: {
  warn?: boolean
}): TRouter {
  const value = Solid.useContext(routerContext)
  if (process.env.NODE_ENV !== 'production') {
    if ((opts?.warn ?? true) && !value) {
      console.warn(
        'Warning: useRouter must be used inside a <RouterProvider> component!',
      )
    }
  }
  return value as TRouter
}
