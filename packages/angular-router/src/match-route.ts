import {
  assertInInjectionContext,
  computed,
  Directive,
  inject,
  Injector,
  input,
  runInInjectionContext,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  AnyRouter,
  DeepPartial,
  MakeOptionalPathParams,
  MakeOptionalSearchParams,
  MaskOptions,
  RegisteredRouter,
  MatchRouteOptions as TanstackMatchRouteOptions,
  ToSubOptionsProps,
} from '@tanstack/router-core';
import { combineLatest, map, switchMap } from 'rxjs';
import { Link } from './link';
import { injectRouter } from './router';
import { routerState$ } from './router-state';

export type MatchRouteOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = ToSubOptionsProps<TRouter, TFrom, TTo> &
  DeepPartial<MakeOptionalSearchParams<TRouter, TFrom, TTo>> &
  DeepPartial<MakeOptionalPathParams<TRouter, TFrom, TTo>> &
  MaskOptions<TRouter, TMaskFrom, TMaskTo> &
  TanstackMatchRouteOptions & { injector?: Injector };

export function matchRoute$<TRouter extends AnyRouter = RegisteredRouter>({
  injector,
}: { injector?: Injector } = {}) {
  !injector && assertInInjectionContext(matchRoute$);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    const router = injectRouter();
    const status$ = routerState$({ select: (s) => s.status });

    return <
      const TFrom extends string = string,
      const TTo extends string | undefined = undefined,
      const TMaskFrom extends string = TFrom,
      const TMaskTo extends string = '',
    >(
      opts: MatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
    ) => {
      const { pending, caseSensitive, fuzzy, includeSearch, ...rest } = opts;
      return status$.pipe(
        map(() =>
          router.matchRoute(rest as any, {
            pending,
            caseSensitive,
            fuzzy,
            includeSearch,
          })
        )
      );
    };
  });
}

export function matchRoute<TRouter extends AnyRouter = RegisteredRouter>({
  injector,
}: { injector?: Injector } = {}) {
  !injector && assertInInjectionContext(matchRoute);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    const matchRoute$Return = matchRoute$({ injector });
    return <
      const TFrom extends string = string,
      const TTo extends string | undefined = undefined,
      const TMaskFrom extends string = TFrom,
      const TMaskTo extends string = '',
    >(
      opts: MatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
    ) => {
      return toSignal(matchRoute$Return(opts as any), { injector });
    };
  });
}

export type MakeMatchRouteOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = MatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>;

@Directive({ selector: '[match]', exportAs: 'matchRoute' })
export class MatchRoute<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
> {
  matchRoute = input<
    Partial<MakeMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>>
  >({}, { alias: 'match' });

  private status$ = routerState$({ select: (s) => s.status });
  private matchRouteFn = matchRoute$<TRouter>();

  private parentLink = inject(Link, { optional: true });
  private options = computed(() => {
    const parentLinkOptions = this.parentLink?.linkOptions();
    if (!parentLinkOptions) return this.matchRoute();
    return { ...parentLinkOptions, ...this.matchRoute() };
  });

  match$ = combineLatest([toObservable(this.options), this.status$]).pipe(
    switchMap(([matchRoute]) => this.matchRouteFn(matchRoute as any))
  );
  match = toSignal(this.match$);
}
