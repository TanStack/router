import {
  Directive,
  effect,
  EnvironmentInjector,
  inject,
  input,
  Provider,
} from '@angular/core';
import {
  AnyRoute,
  type AnyRouter,
  type RegisteredRouter,
  type RouterOptions,
} from '@tanstack/router-core';
import { Matches } from './matches';
import { injectRouter, NgRouter } from './router';

export type RouterRootOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<
  RouterOptions<
    TRouter['routeTree'],
    NonNullable<TRouter['options']['trailingSlash']>,
    false,
    TRouter['history'],
    TDehydrated
  >,
  'context'
> & {
  router: TRouter;
  context?: Partial<
    RouterOptions<
      TRouter['routeTree'],
      NonNullable<TRouter['options']['trailingSlash']>,
      false,
      TRouter['history'],
      TDehydrated
    >['context']
  >;
};

@Directive({
  selector: 'router-root,RouterRoot',
  hostDirectives: [Matches],
})
export class RouterRoot<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
> {
  router = input<RouterRootOptions<TRouter, TDehydrated>['router']>(
    injectRouter() as unknown as TRouter
  );
  options = input<Omit<RouterRootOptions<TRouter, TDehydrated>, 'router'>>({});

  constructor() {
    const environmentInjector = inject(EnvironmentInjector);
    effect(() => {
      const [router, options] = [this.router(), this.options()];
      router.update({
        ...router.options,
        ...options,
        context: {
          ...router.options.context,
          ...options.context,
          getRouteInjector(routeId: string, providers: Provider[] = []) {
            return (
              router as unknown as NgRouter<AnyRoute>
            ).getRouteEnvInjector(
              routeId,
              environmentInjector,
              providers,
              router
            );
          },
        },
      });
    });
  }
}
