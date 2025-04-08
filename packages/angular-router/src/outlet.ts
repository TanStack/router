import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  EnvironmentInjector,
  InjectionToken,
  Injector,
  ViewContainerRef,
  afterNextRender,
  inject,
  input,
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import {
  createControlledPromise,
  getLocationChangeInfo,
  isNotFound,
  isRedirect,
  pick,
  rootRouteId,
} from '@tanstack/router-core'
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  of,
  switchMap,
  take,
  throwError,
  withLatestFrom,
} from 'rxjs'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import { DefaultError } from './default-error'
import { DefaultNotFound } from './default-not-found'
import { distinctUntilRefChanged } from './distinct-until-ref-changed'
import { isDevMode } from './is-dev-mode'
import { ERROR_COMPONENT_CONTEXT, NOT_FOUND_COMPONENT_CONTEXT } from './route'
import { injectRouter } from './router'
import { routerState$ } from './router-state'

import type { ComponentRef, Type } from '@angular/core'
import type { Subscription } from 'rxjs'

@Directive()
export class OnRendered {
  private match = inject(RouteMatch)
  private router = injectRouter()

  private parentRouteId$ = combineLatest([
    this.match.matchId$,
    routerState$({ select: (s) => s.matches }),
  ]).pipe(
    map(
      ([matchId, matches]) =>
        matches.find((d) => d.id === matchId)?.routeId as string,
    ),
    distinctUntilRefChanged(),
  )
  private location$ = routerState$({
    select: (s) => s.resolvedLocation?.state.key,
  })

  constructor() {
    let subscription: Subscription
    afterNextRender(() => {
      subscription = combineLatest([
        this.parentRouteId$,
        this.location$,
      ]).subscribe(([parentRouteId]) => {
        if (!parentRouteId || parentRouteId !== rootRouteId) return
        this.router.emit({
          type: 'onRendered',
          ...getLocationChangeInfo(this.router.state),
        })
      })
    })

    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe()
    })
  }
}

export const MATCH_ID = new InjectionToken<string>('MATCH_ID')

@Component({
  selector: 'route-match,RouteMatch',
  template: ``,
  hostDirectives: [OnRendered],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-matchId]': 'matchId()',
  },
})
export class RouteMatch {
  matchId = input.required<string>()

  private isDevMode = isDevMode()
  private router = injectRouter()
  private vcr = inject(ViewContainerRef)
  private injector = inject(Injector)
  private environmentInjector = inject(EnvironmentInjector)

  matchId$ = toObservable(this.matchId)
  private resetKey$ = routerState$({ select: (s) => s.loadedAt.toString() })
  private matches$ = routerState$({ select: (s) => s.matches })
  private routeId$ = combineLatest([this.matchId$, this.matches$]).pipe(
    map(
      ([matchId, matches]) =>
        matches.find((d) => d.id === matchId)?.routeId as string,
    ),
    distinctUntilRefChanged(),
  )

  private route$ = this.routeId$.pipe(
    map((routeId) => this.router.routesById[routeId]),
    distinctUntilRefChanged(),
  )
  private pendingComponent$ = this.route$.pipe(
    map(
      (route) =>
        route.options.pendingComponent ||
        this.router.options.defaultPendingComponent,
    ),
    distinctUntilRefChanged(),
  )
  private errorComponent$ = this.route$.pipe(
    map(
      (route) =>
        route.options.errorComponent ||
        this.router.options.defaultErrorComponent,
    ),
    distinctUntilRefChanged(),
  )
  private onCatch$ = this.route$.pipe(
    map((route) => route.options.onCatch || this.router.options.defaultOnCatch),
    distinctUntilRefChanged(),
  )

  private matchIndex$ = combineLatest([this.matchId$, this.matches$]).pipe(
    map(([matchId, matches]) => matches.findIndex((d) => d.id === matchId)),
    distinctUntilRefChanged(),
  )
  private matchState$ = combineLatest([this.matchIndex$, this.matches$]).pipe(
    map(([matchIndex, matches]) => matches[matchIndex]),
    filter((match) => !!match),
    map((match) => ({
      routeId: match.routeId as string,
      match: pick(match, ['id', 'status', 'error']),
    })),
  )

  private matchRoute$ = this.matchState$.pipe(
    map(({ routeId }) => this.router.routesById[routeId]),
    distinctUntilRefChanged(),
  )
  private match$ = this.matchState$.pipe(
    map(({ match }) => match),
    distinctUntilChanged(
      (a, b) => !!a && !!b && a.id === b.id && a.status === b.status,
    ),
  )
  private matchLoad$ = this.match$.pipe(
    withLatestFrom(this.matchRoute$),
    switchMap(([match, matchRoute]) => {
      const loadPromise = this.router.getMatch(match.id)?.loadPromise
      if (!loadPromise) return Promise.resolve() as any

      if (match.status === 'pending') {
        const pendingMinMs =
          matchRoute.options.pendingMinMs ??
          this.router.options.defaultPendingMinMs
        let minPendingPromise = this.router.getMatch(
          match.id,
        )?.minPendingPromise

        if (pendingMinMs && !minPendingPromise) {
          // Create a promise that will resolve after the minPendingMs
          if (!this.router.isServer) {
            minPendingPromise = createControlledPromise<void>()
            Promise.resolve().then(() => {
              this.router.updateMatch(match.id, (prev) => ({
                ...prev,
                minPendingPromise,
              }))
            })

            setTimeout(() => {
              minPendingPromise?.resolve()
              // We've handled the minPendingPromise, so we can delete it
              this.router.updateMatch(match.id, (prev) => ({
                ...prev,
                minPendingPromise: undefined,
              }))
            }, pendingMinMs)
          }
        }

        return minPendingPromise?.then(() => loadPromise) || loadPromise
      }

      return loadPromise
    }),
    distinctUntilRefChanged(),
  )

  private run$ = this.routeId$.pipe(
    switchMap((routeId) => {
      invariant(
        routeId,
        `Could not find routeId for matchId "${this.matchId()}". Please file an issue!`,
      )
      return combineLatest([
        this.match$,
        this.matchRoute$,
        this.resetKey$,
      ]).pipe(
        switchMap(([match, route]) => {
          if (match.status === 'notFound') {
            invariant(isNotFound(match.error), 'Expected a notFound error')
            let notFoundCmp: Type<any> | undefined
            if (!route.options.notFoundComponent) {
              notFoundCmp = this.router.options.defaultNotFoundComponent?.()
              if (!notFoundCmp) {
                if (this.isDevMode) {
                  warning(
                    route.options.notFoundComponent,
                    `A notFoundError was encountered on the route with ID "${route.id}", but a notFoundComponent option was not configured, nor was a router level defaultNotFoundComponent configured. Consider configuring at least one of these to avoid TanStack Router's overly generic defaultNotFoundComponent (<p>Page not found</p>)`,
                  )
                }
                notFoundCmp = DefaultNotFound
              }
            } else {
              notFoundCmp = route.options.notFoundComponent?.()
            }

            if (!notFoundCmp) return of(null)

            const injector = this.router.getRouteInjector(
              route.id + '-not-found',
              this.injector,
              [{ provide: NOT_FOUND_COMPONENT_CONTEXT, useValue: {} }],
            )
            return of({
              component: notFoundCmp,
              injector,
              environmentInjector: null,
              clearView: true,
            } as const)
          }

          if (match.status === 'redirected' || match.status === 'pending') {
            if (match.status === 'redirected') {
              invariant(isRedirect(match.error), 'Expected a redirect error')
            }

            return this.matchLoad$.pipe(
              withLatestFrom(this.pendingComponent$),
              switchMap(([, pendingComponent]) => {
                const pendingCmp = pendingComponent?.()
                if (!pendingCmp) return of(null)
                return of({
                  component: pendingCmp,
                  injector: null,
                  environmentInjector: null,
                  clearView: true,
                } as const)
              }),
            )
          }

          if (match.status === 'error') {
            return this.errorComponent$.pipe(
              take(1),
              switchMap((errorComponent) => {
                const errorCmp = errorComponent?.() || DefaultError
                const injector = this.router.getRouteInjector(
                  route.id + '-error',
                  this.injector,
                  [
                    {
                      provide: ERROR_COMPONENT_CONTEXT,
                      useValue: {
                        error: match.error,
                        info: { componentStack: '' },
                        reset: () => void this.router.invalidate(),
                      },
                    },
                  ],
                )
                return of({
                  component: errorCmp,
                  injector,
                  environmentInjector: null,
                  clearView: true,
                } as const)
              }),
            )
          }

          if (match.status === 'success') {
            const successComponent = route.options.component?.() || Outlet

            if (this.cmp === successComponent) {
              return of({ clearView: false } as const)
            }

            this.cmpRef = undefined
            this.cmp = successComponent
            const injector = this.router.getRouteInjector(
              route.id,
              this.injector,
            )
            const environmentInjector = this.router.getRouteEnvInjector(
              route.id,
              this.environmentInjector,
              route.options.providers || [],
              this.router,
            )

            return of({
              component: successComponent,
              injector: Injector.create({
                providers: [{ provide: MATCH_ID, useValue: match.id }],
                parent: injector,
              }),
              environmentInjector,
              clearView: true,
            } as const)
          }

          return of(null)
        }),
      )
    }),
    catchError((error) =>
      this.onCatch$.pipe(
        take(1),
        switchMap((onCatch) => throwError(() => [error, onCatch])),
      ),
    ),
  )

  private cmp?: Type<any>
  private cmpRef?: ComponentRef<any>

  constructor() {
    let subscription: Subscription

    afterNextRender(() => {
      subscription = this.run$.subscribe({
        next: (runData) => {
          if (!runData) return
          if (!runData.clearView) {
            this.cmpRef?.changeDetectorRef.markForCheck()
            return
          }
          const { component, injector, environmentInjector } = runData
          this.vcr.clear()

          this.cmpRef = this.vcr.createComponent(component, {
            injector: injector || undefined,
            environmentInjector: environmentInjector || undefined,
          })
          this.cmpRef.changeDetectorRef.markForCheck()
        },
        error: (error) => {
          if (Array.isArray(error)) {
            const [errorToThrow, onCatch] = error
            if (onCatch) onCatch(errorToThrow)
            console.error(errorToThrow)
            return
          }
          console.error(error)
        },
      })
    })

    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe()
      this.vcr.clear()
      this.cmp = undefined
      this.cmpRef = undefined
    })
  }
}

@Component({
  selector: 'outlet,Outlet',
  template: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Outlet {
  private matchId = inject(MATCH_ID)
  private router = injectRouter()
  private vcr = inject(ViewContainerRef)
  private isDevMode = isDevMode()

  protected readonly defaultPendingComponent =
    this.router.options.defaultPendingComponent?.()

  private matches$ = routerState$({ select: (s) => s.matches })
  private routeId$ = this.matches$.pipe(
    map(
      (matches) =>
        matches.find((d) => d.id === this.matchId)?.routeId as string,
    ),
    distinctUntilRefChanged(),
  )
  private route$ = this.routeId$.pipe(
    map((routeId) => this.router.routesById[routeId]),
    distinctUntilRefChanged(),
  )
  private parentGlobalNotFound$ = this.matches$.pipe(
    map((matches) => {
      const parentMatch = matches.find((d) => d.id === this.matchId)
      if (!parentMatch) {
        warning(
          false,
          `Could not find parent match for matchId "${this.matchId}". Please file an issue!`,
        )
        return false
      }
      return parentMatch.globalNotFound
    }),
  )

  private childMatchId$ = this.matches$.pipe(
    map((matches) => {
      const index = matches.findIndex((d) => d.id === this.matchId)
      if (index === -1) return null
      return matches[index + 1]?.id
    }),
    distinctUntilRefChanged(),
  )
  private matchLoad$ = this.childMatchId$.pipe(
    switchMap((childMatchId) => {
      if (!childMatchId) return Promise.resolve() as any
      const loadPromise = this.router.getMatch(childMatchId)?.loadPromise
      if (!loadPromise) return Promise.resolve() as any
      return loadPromise
    }),
  )

  private renderedId?: string
  private cmpRef?: ComponentRef<any>

  private run$ = combineLatest([
    this.parentGlobalNotFound$,
    this.childMatchId$,
  ]).pipe(
    switchMap(([parentGlobalNotFound, childMatchId]) => {
      if (parentGlobalNotFound) {
        return this.route$.pipe(
          map((route) => {
            let notFoundCmp: Type<any> | undefined = undefined

            if (!route.options.notFoundComponent) {
              notFoundCmp = this.router.options.defaultNotFoundComponent?.()
              if (!notFoundCmp) {
                if (this.isDevMode) {
                  warning(
                    route.options.notFoundComponent,
                    `A notFoundError was encountered on the route with ID "${route.id}", but a notFoundComponent option was not configured, nor was a router level defaultNotFoundComponent configured. Consider configuring at least one of these to avoid TanStack Router's overly generic defaultNotFoundComponent (<p>Page not found</p>)`,
                  )
                }
                notFoundCmp = DefaultNotFound
              }
            } else {
              notFoundCmp = route.options.notFoundComponent?.()
            }

            if (!notFoundCmp) return null

            this.renderedId = route.id + '-not-found'
            const injector = this.router.getRouteInjector(
              route.id + '-not-found',
              this.vcr.injector,
              [{ provide: NOT_FOUND_COMPONENT_CONTEXT, useValue: {} }],
            )
            return {
              component: notFoundCmp,
              injector,
              clearView: true,
              childMatchId: null,
            } as const
          }),
        )
      }

      if (!childMatchId) return of(null)

      if (this.renderedId === childMatchId) {
        return of({ clearView: false } as const)
      }

      this.cmpRef = undefined

      if (childMatchId === rootRouteId) {
        return this.matchLoad$.pipe(
          map(() => {
            return {
              component: this.defaultPendingComponent,
              injector: null,
              clearView: true,
              childMatchId: null,
            } as const
          }),
        )
      }

      this.renderedId = childMatchId
      return of({
        component: RouteMatch,
        injector: null,
        clearView: true,
        childMatchId,
      } as const)
    }),
    catchError((error) => throwError(() => error)),
  )

  constructor() {
    let subscription: Subscription
    afterNextRender(() => {
      subscription = this.run$.subscribe({
        next: (runData) => {
          if (!runData) return
          if (!runData.clearView) {
            this.cmpRef?.changeDetectorRef.markForCheck()
            return
          }
          const { component, injector, childMatchId } = runData
          this.vcr.clear()
          if (!component) return
          this.cmpRef = this.vcr.createComponent(component, {
            injector: injector || undefined,
          })
          if (childMatchId) {
            this.cmpRef.setInput('matchId', childMatchId)
          }
          this.cmpRef.changeDetectorRef.markForCheck()
        },
        error: (error) => {
          console.error(error)
        },
      })
    })

    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe()
      this.vcr.clear()
      this.cmpRef = undefined
      this.renderedId = undefined
    })
  }
}
