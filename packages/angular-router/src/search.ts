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
  ResolveUseSearch,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseSearchResult,
} from '@tanstack/router-core'
import type { Observable } from 'rxjs'

export interface SearchBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (state: ResolveUseSearch<TRouter, TFrom, TStrict>) => TSelected
  shouldThrow?: TThrow
  injector?: Injector
}

export type SearchOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  SearchBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type SearchRoute<TObservable extends boolean, out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: SearchBaseOptions<
    TRouter,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected
  >,
) => TObservable extends true
  ? Observable<UseSearchResult<TRouter, TFrom, true, TSelected>>
  : Signal<UseSearchResult<TRouter, TFrom, true, TSelected>>

export function search$<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>({
  injector,
  ...opts
}: SearchOptions<
  TRouter,
  TFrom,
  TStrict,
  ThrowConstraint<TStrict, TThrow>,
  TSelected
>): Observable<
  ThrowOrOptional<UseSearchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  !injector && assertInInjectionContext(search)

  if (!injector) {
    injector = inject(Injector)
  }

  return runInInjectionContext(injector, () => {
    return match$({
      from: opts.from!,
      strict: opts.strict,
      shouldThrow: opts.shouldThrow,
      select: (match) => {
        return opts.select ? opts.select(match.search) : match.search
      },
    }) as any
  })
}

export function search<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>({
  injector,
  ...opts
}: SearchOptions<
  TRouter,
  TFrom,
  TStrict,
  ThrowConstraint<TStrict, TThrow>,
  TSelected
>): Signal<
  ThrowOrOptional<UseSearchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  !injector && assertInInjectionContext(search)

  if (!injector) {
    injector = inject(Injector)
  }

  return runInInjectionContext(injector, () => {
    return toSignal(search$({ injector, ...opts } as unknown as any)) as any
  })
}
