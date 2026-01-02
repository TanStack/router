import { getRouterInjectionKey } from './routerInjectionToken'
import { inject } from '@angular/core'
import warning from 'tiny-warning'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

export function injectRouter<
  TRouter extends AnyRouter = RegisteredRouter,
>(opts?: { warn?: boolean }): TRouter {
  const router = inject(getRouterInjectionKey(), { optional: true })
  warning(
    !((opts?.warn ?? true) && !router),
    'No router found in the injector contetext for injectRouter!',
  )
  return router as any
}

export type InjectRouterResult<TRouter extends AnyRouter = RegisteredRouter> =
  TRouter
