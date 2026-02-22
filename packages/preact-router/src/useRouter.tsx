import warning from 'tiny-warning'
import { useContext } from 'preact/hooks'
import { getRouterContext } from './routerContext'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

/**
 * Access the current TanStack Router instance from Preact context.
 * Must be used within a `RouterProvider`.
 */
export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(opts?: {
  warn?: boolean
}): TRouter {
  const value = useContext(getRouterContext())
  warning(
    !((opts?.warn ?? true) && !value),
    'useRouter must be used inside a <RouterProvider> component!',
  )
  return value as any
}
