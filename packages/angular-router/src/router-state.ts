import {
  assertInInjectionContext,
  inject,
  Injector,
  runInInjectionContext,
  Signal,
  type ValueEqualityFn,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AnyRouter,
  type RegisteredRouter,
  type RouterState,
  shallow,
} from '@tanstack/router-core';
import { distinctUntilChanged, map, Observable } from 'rxjs';
import { injectRouterState } from './router';

export type RouterStateResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected ? RouterState<TRouter['routeTree']> : TSelected;

export type RouterStateOptions<TRouter extends AnyRouter, TSelected> = {
  select?: (state: RouterState<TRouter['routeTree']>) => TSelected;
  equal?: ValueEqualityFn<
    RouterStateResult<NoInfer<TRouter>, NoInfer<TSelected>>
  >;
  injector?: Injector;
};

export function routerState$<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({
  select,
  injector,
  equal = shallow,
}: RouterStateOptions<TRouter, TSelected>) {
  !injector && assertInInjectionContext(routerState$);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    const rootRouterState = injectRouterState();
    if (select)
      return rootRouterState.pipe(
        map((s) => select(s) as any),
        distinctUntilChanged(equal)
      );
    return rootRouterState.pipe(distinctUntilChanged(equal) as any);
  }) as Observable<RouterStateResult<TRouter, TSelected>>;
}

export function routerState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({
  select,
  injector,
  equal = shallow,
}: RouterStateOptions<TRouter, TSelected> = {}) {
  !injector && assertInInjectionContext(routerState);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () =>
    toSignal(routerState$({ select, injector, equal }), { injector })
  ) as Signal<RouterStateResult<TRouter, TSelected>>;
}
