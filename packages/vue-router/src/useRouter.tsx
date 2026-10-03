import * as Vue from 'vue'
import { routerContext } from './routerContext'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(opts?: {
  warn?: boolean
}): TRouter {
  return useRouterContext(opts)?.[0] as TRouter
}

export function useRouterContext(opts?: { warn?: boolean }) {
  const value = Vue.inject(routerContext, null)
  if (process.env.NODE_ENV !== 'production') {
    if ((opts?.warn ?? true) && !value) {
      console.warn(
        'Warning: useRouter must be used inside a <RouterProvider> component!',
      )
    }
  }
  return value
}
