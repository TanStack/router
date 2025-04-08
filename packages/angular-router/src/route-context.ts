import {
  Injector,
  assertInInjectionContext,
  inject,
  runInInjectionContext,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { match$ } from './match'

import type { Signal } from '@angular/core'
import type {
  AnyRouter,
  RegisteredRouter,
  UseRouteContextBaseOptions,
  UseRouteContextOptions,
  UseRouteContextResult,
} from '@tanstack/router-core'
import type { Observable } from 'rxjs'

export type RouteContextRoute<TObservable extends boolean, out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseRouteContextBaseOptions<TRouter, TFrom, true, TSelected> & {
    injector?: Injector
  },
) => TObservable extends true
  ? Observable<UseRouteContextResult<TRouter, TFrom, true, TSelected>>
  : Signal<UseRouteContextResult<TRouter, TFrom, true, TSelected>>

export function routeContext$<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>({
  injector,
  ...opts
}: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected> & {
  injector?: Injector
}): Observable<UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>> {
  !injector && assertInInjectionContext(routeContext)

  if (!injector) {
    injector = inject(Injector)
  }

  return runInInjectionContext(injector, () => {
    return match$({
      ...(opts as any),
      select: (match) => {
        return opts.select ? opts.select(match.context) : match.context
      },
    }) as any
  })
}

export function routeContext<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>({
  injector,
  ...opts
}: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected> & {
  injector?: Injector
}): Signal<UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>> {
  !injector && assertInInjectionContext(routeContext)

  if (!injector) {
    injector = inject(Injector)
  }

  return runInInjectionContext(injector, () => {
    return toSignal(
      routeContext$({ injector, ...opts } as unknown as any),
    ) as any
  })
}
