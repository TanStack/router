import warning from 'tiny-warning'
import { injectRouter } from './routerContext'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(opts?: {
  warn?: boolean
}): TRouter {
  try {
    return injectRouter() as TRouter
  } catch (err) {
    if (opts?.warn ?? true) {
      warning(
        false,
        'useRouter must be used inside a <RouterProvider> component!',
      )
    }
    return null as unknown as TRouter
  }
}
