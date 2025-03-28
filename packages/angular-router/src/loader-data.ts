import {
  assertInInjectionContext,
  inject,
  Injector,
  runInInjectionContext,
  Signal,
} from '@angular/core';
import {
  AnyRouter,
  RegisteredRouter,
  ResolveUseLoaderData,
  StrictOrFrom,
  UseLoaderDataResult,
} from '@tanstack/router-core';

import { toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { match$ } from './match';

export interface LoaderDataBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (match: ResolveUseLoaderData<TRouter, TFrom, TStrict>) => TSelected;
  injector?: Injector;
}

export type LoaderDataOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  LoaderDataBaseOptions<TRouter, TFrom, TStrict, TSelected>;

export type LoaderDataRoute<TObservable extends boolean, out TId> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: LoaderDataBaseOptions<TRouter, TId, true, TSelected>
) => TObservable extends true
  ? Observable<UseLoaderDataResult<TRouter, TId, true, TSelected>>
  : Signal<UseLoaderDataResult<TRouter, TId, true, TSelected>>;

export function loaderData$<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>({
  injector,
  ...opts
}: LoaderDataOptions<TRouter, TFrom, TStrict, TSelected>): Observable<
  UseLoaderDataResult<TRouter, TFrom, TStrict, TSelected>
> {
  !injector && assertInInjectionContext(loaderData$);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return match$({
      injector,
      from: opts.from,
      strict: opts.strict,
      select: (s) => (opts.select ? opts.select(s.loaderData) : s.loaderData),
    }) as any;
  });
}

export function loaderData<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>({
  injector,
  ...opts
}: LoaderDataOptions<TRouter, TFrom, TStrict, TSelected>): Signal<
  UseLoaderDataResult<TRouter, TFrom, TStrict, TSelected>
> {
  !injector && assertInInjectionContext(loaderData);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return toSignal(loaderData$({ injector, ...opts } as any), { injector });
  }) as any;
}
