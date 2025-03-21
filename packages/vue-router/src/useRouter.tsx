import * as Vue from 'vue'
import warning from 'tiny-warning'
import { getRouterContext } from './routerContext'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(opts?: {
  warn?: boolean
}): TRouter {
  try {
    const value = Vue.inject(getRouterContext() as any, null)
    warning(
      !((opts?.warn ?? true) && !value),
      'useRouter must be used inside a <RouterProvider> component!',
    )
    return value as any
  } catch (err) {
    warning(
      opts?.warn ?? true,
      'Error injecting router context. Make sure useRouter is used inside a <RouterProvider> component!',
    )
    return null as any
  }
}
