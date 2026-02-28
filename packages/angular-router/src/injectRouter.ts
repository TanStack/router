import * as Angular from '@angular/core'
import warning from 'tiny-warning'
import { getRouterInjectionKey } from './routerInjectionToken'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

export function injectRouter<
  TRouter extends AnyRouter = RegisteredRouter,
>(opts?: { warn?: boolean }): TRouter {
  const router = Angular.inject(getRouterInjectionKey(), { optional: true })
  warning(
    !((opts?.warn ?? true) && !router),
    'injectRouter must be used inside a <router-provider> component!',
  )
  return router as any
}

export type InjectRouterResult<TRouter extends AnyRouter = RegisteredRouter> =
  TRouter
