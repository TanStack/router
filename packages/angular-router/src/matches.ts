import {
  afterNextRender,
  assertInInjectionContext,
  ComponentRef,
  DestroyRef,
  Directive,
  inject,
  Injector,
  runInInjectionContext,
  Signal,
  ViewContainerRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AnyRouter,
  MakeRouteMatchUnion,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core';
import {
  combineLatest,
  map,
  Observable,
  of,
  Subscription,
  switchMap,
} from 'rxjs';
import { DefaultError } from './default-error';
import { distinctUntilRefChanged } from './distinct-until-ref-changed';
import { MATCH_ID, RouteMatch } from './outlet';
import { ERROR_COMPONENT_CONTEXT } from './route';
import { injectRouter } from './router';
import { routerState$ } from './router-state';
import { Transitioner } from './transitioner';

@Directive({ hostDirectives: [Transitioner] })
export class Matches {
  private router = injectRouter();
  private injector = inject(Injector);
  private vcr = inject(ViewContainerRef);

  private defaultPendingComponent =
    this.router.options.defaultPendingComponent?.();

  private resetKey$ = routerState$({ select: (s) => s.loadedAt.toString() });
  private rootMatchId$ = routerState$({ select: (s) => s.matches[0]?.id });

  private matchLoad$ = this.rootMatchId$.pipe(
    switchMap((rootMatchId) => {
      if (!rootMatchId) return of({ pending: false });
      const loadPromise = this.router.getMatch(rootMatchId)?.loadPromise;
      if (!loadPromise) return of({ pending: false });
      return of({ pending: true }).pipe(
        switchMap(() => loadPromise.then(() => ({ pending: false })))
      );
    })
  );

  private cmpRef?: ComponentRef<any>;

  private run$ = this.matchLoad$.pipe(
    switchMap(({ pending }) => {
      if (pending) {
        if (this.defaultPendingComponent) {
          return of({
            component: this.defaultPendingComponent,
            clearView: true,
            matchId: null,
          } as const);
        }
        return of(null);
      }

      return combineLatest([this.rootMatchId$, this.resetKey$]).pipe(
        map(([matchId]) => {
          if (!matchId) return null;
          if (this.cmpRef) return { clearView: false } as const;
          return {
            component: RouteMatch,
            matchId,
            clearView: true,
          } as const;
        })
      );
    })
  );

  constructor() {
    let subscription: Subscription;
    afterNextRender(() => {
      subscription = this.run$.subscribe({
        next: (runData) => {
          if (!runData) return;
          if (!runData.clearView) {
            this.cmpRef?.changeDetectorRef.markForCheck();
            return;
          }
          const { component, matchId } = runData;
          this.vcr.clear();
          this.cmpRef = this.vcr.createComponent(component);
          if (matchId) {
            this.cmpRef.setInput('matchId', matchId);
          }
          this.cmpRef.changeDetectorRef.markForCheck();
        },
        error: (error) => {
          console.error(error);
          const injector = Injector.create({
            providers: [
              {
                provide: ERROR_COMPONENT_CONTEXT,
                useValue: {
                  error: error,
                  info: { componentStack: '' },
                  reset: () => void this.router.invalidate(),
                },
              },
            ],
            parent: this.injector,
          });
          this.vcr.clear();
          const ref = this.vcr.createComponent(DefaultError, { injector });
          ref.changeDetectorRef.markForCheck();
          this.cmpRef = undefined;
        },
      });
    });

    inject(DestroyRef).onDestroy(() => {
      subscription?.unsubscribe();
      this.vcr.clear();
      this.cmpRef = undefined;
    });
  }
}

export interface MatchesBaseOptions<TRouter extends AnyRouter, TSelected> {
  select?: (matches: Array<MakeRouteMatchUnion<TRouter>>) => TSelected;
  injector?: Injector;
}

export type MatchesResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected ? Array<MakeRouteMatchUnion<TRouter>> : TSelected;

export function matches$<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({
  injector,
  ...opts
}: MatchesBaseOptions<TRouter, TSelected> = {}): Observable<
  MatchesResult<TRouter, TSelected>
> {
  !injector && assertInInjectionContext(matches$);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return routerState$({
      injector,
      select: (state: RouterState<TRouter['routeTree']>) => {
        const matches = state.matches;
        return opts.select
          ? opts.select(matches as Array<MakeRouteMatchUnion<TRouter>>)
          : matches;
      },
    }) as Observable<MatchesResult<TRouter, TSelected>>;
  });
}

export function matches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({ injector, ...opts }: MatchesBaseOptions<TRouter, TSelected> = {}): Signal<
  MatchesResult<TRouter, TSelected>
> {
  !injector && assertInInjectionContext(matches);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return toSignal(matches$({ injector, ...opts })) as Signal<
      MatchesResult<TRouter, TSelected>
    >;
  });
}

export function parentMatches$<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({
  injector,
  ...opts
}: MatchesBaseOptions<TRouter, TSelected> = {}): Observable<
  MatchesResult<TRouter, TSelected>
> {
  !injector && assertInInjectionContext(parentMatches$);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    const closestMatch = inject(MATCH_ID);
    return routerState$({ injector, select: (s) => s.matches }).pipe(
      map((matches) => {
        const sliced = matches.slice(
          0,
          matches.findIndex((d) => d.id === closestMatch)
        );
        return opts.select
          ? opts.select(sliced as Array<MakeRouteMatchUnion<TRouter>>)
          : sliced;
      }),
      distinctUntilRefChanged() as any
    ) as Observable<MatchesResult<TRouter, TSelected>>;
  });
}

export function parentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({ injector, ...opts }: MatchesBaseOptions<TRouter, TSelected> = {}): Signal<
  MatchesResult<TRouter, TSelected>
> {
  !injector && assertInInjectionContext(parentMatches);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return toSignal(parentMatches$({ injector, ...opts })) as Signal<
      MatchesResult<TRouter, TSelected>
    >;
  });
}
export function childMatches$<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({
  injector,
  ...opts
}: MatchesBaseOptions<TRouter, TSelected> = {}): Observable<
  MatchesResult<TRouter, TSelected>
> {
  !injector && assertInInjectionContext(childMatches$);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    const closestMatch = inject(MATCH_ID);
    return routerState$({ injector, select: (s) => s.matches }).pipe(
      map((matches) => {
        const sliced = matches.slice(
          matches.findIndex((d) => d.id === closestMatch) + 1
        );
        return opts.select
          ? opts.select(sliced as Array<MakeRouteMatchUnion<TRouter>>)
          : sliced;
      }),
      distinctUntilRefChanged() as any
    ) as Observable<MatchesResult<TRouter, TSelected>>;
  });
}

export function childMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>({ injector, ...opts }: MatchesBaseOptions<TRouter, TSelected> = {}): Signal<
  MatchesResult<TRouter, TSelected>
> {
  !injector && assertInInjectionContext(childMatches);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return toSignal(childMatches$({ injector, ...opts })) as Signal<
      MatchesResult<TRouter, TSelected>
    >;
  });
}
