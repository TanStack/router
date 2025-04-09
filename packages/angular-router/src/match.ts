import {
  Injector,
  assertInInjectionContext,
  computed,
  inject,
  runInInjectionContext,
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { combineLatest, distinctUntilChanged, map } from 'rxjs'
import invariant from 'tiny-invariant'
import { shallow } from '@tanstack/router-core'
import { MATCH_ID } from './outlet'
import { routerState$ } from './router-state'

import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RegisteredRouter,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'
import type { Observable } from 'rxjs'
import type { Signal } from '@angular/core'

export interface MatchBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (
    match: MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>,
  ) => TSelected
  shouldThrow?: TThrow
  injector?: Injector
}

export type MatchRoute<TObservable extends boolean, out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: MatchBaseOptions<TRouter, TFrom, true, true, TSelected>,
) => TObservable extends true
  ? Observable<MatchResult<TRouter, TFrom, true, TSelected>>
  : Signal<MatchResult<TRouter, TFrom, true, TSelected>>

export type MatchOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  MatchBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type MatchResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? TStrict extends true
    ? MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>
    : MakeRouteMatchUnion<TRouter>
  : TSelected

export function match$<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>({
  injector,
  ...opts
}: MatchOptions<
  TRouter,
  TFrom,
  TStrict,
  ThrowConstraint<TStrict, TThrow>,
  TSelected
>): Observable<
  ThrowOrOptional<MatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  !injector && assertInInjectionContext(match$)

  if (!injector) {
    injector = inject(Injector)
  }

  return runInInjectionContext(injector, () => {
    const closestMatchId = inject(MATCH_ID, { optional: true })
    const nearestMatchId = computed(() => {
      if (opts.from) return null
      return closestMatchId
    })

    return combineLatest([
      routerState$({ select: (s) => s.matches, injector }),
      toObservable(nearestMatchId),
    ]).pipe(
      map(([matches, matchId]) => {
        const match = matches.find((d) => {
          return opts.from ? opts.from === d.routeId : d.id === matchId
        })
        invariant(
          !((opts.shouldThrow ?? true) && !match),
          `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
        )
        if (match === undefined) {
          return undefined
        }

        return opts.select ? opts.select(match) : match
      }),
      distinctUntilChanged(shallow),
    ) as any
  })
}

export function match<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>({
  injector,
  ...opts
}: MatchOptions<
  TRouter,
  TFrom,
  TStrict,
  ThrowConstraint<TStrict, TThrow>,
  TSelected
>): Signal<
  ThrowOrOptional<MatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  !injector && assertInInjectionContext(match)

  if (!injector) {
    injector = inject(Injector)
  }

  return runInInjectionContext(injector, () => {
    return toSignal(match$({ injector, ...opts } as unknown as any), {
      injector,
    })
  }) as any
}
