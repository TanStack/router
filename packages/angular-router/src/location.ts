import {
  Injector,
  assertInInjectionContext,
  inject,
  runInInjectionContext,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { routerState$ } from './router-state'

import type { Signal } from '@angular/core'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type { Observable } from 'rxjs'

export interface LocationBaseOptions<TRouter extends AnyRouter, TSelected> {
  select?: (state: RouterState<TRouter['routeTree']>['location']) => TSelected
  injector?: Injector
}

export type LocationResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected
  ? RouterState<TRouter['routeTree']>['location']
  : TSelected

export function location$<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({
  injector,
  select,
}: LocationBaseOptions<TRouter, TSelected> = {}): Observable<
  LocationResult<TRouter, TSelected>
> {
  !injector && assertInInjectionContext(location$)

  if (!injector) {
    injector = inject(Injector)
  }

  return runInInjectionContext(injector, () => {
    return routerState$({
      injector,
      select: (state) => (select ? select(state.location) : state.location),
    }) as Observable<LocationResult<TRouter, TSelected>>
  })
}

export function location<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({ injector, select }: LocationBaseOptions<TRouter, TSelected> = {}): Signal<
  LocationResult<TRouter, TSelected>
> {
  !injector && assertInInjectionContext(location)

  if (!injector) {
    injector = inject(Injector)
  }

  return runInInjectionContext(injector, () => {
    return toSignal(location$({ injector, select })) as Signal<
      LocationResult<TRouter, TSelected>
    >
  })
}
