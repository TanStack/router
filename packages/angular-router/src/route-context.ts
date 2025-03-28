import {
  assertInInjectionContext,
  inject,
  Injector,
  runInInjectionContext,
  Signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AnyRouter,
  RegisteredRouter,
  UseRouteContextBaseOptions,
  UseRouteContextOptions,
  UseRouteContextResult,
} from '@tanstack/router-core';
import { Observable } from 'rxjs';
import { match$ } from './match';

export type RouteContextRoute<TObservable extends boolean, out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseRouteContextBaseOptions<TRouter, TFrom, true, TSelected> & {
    injector?: Injector;
  }
) => TObservable extends true
  ? Observable<UseRouteContextResult<TRouter, TFrom, true, TSelected>>
  : Signal<UseRouteContextResult<TRouter, TFrom, true, TSelected>>;

export function routeContext$<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>({
  injector,
  ...opts
}: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected> & {
  injector?: Injector;
}): Observable<UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>> {
  !injector && assertInInjectionContext(routeContext);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return match$({
      ...(opts as any),
      select: (match) => {
        return opts.select ? opts.select(match.context) : match.context;
      },
    }) as any;
  });
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
  injector?: Injector;
}): Signal<UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>> {
  !injector && assertInInjectionContext(routeContext);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return toSignal(routeContext$({ injector, ...opts } as any)) as any;
  });
}
