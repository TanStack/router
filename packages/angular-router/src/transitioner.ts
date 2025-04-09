import { DOCUMENT } from '@angular/common'
import {
  ChangeDetectorRef,
  DestroyRef,
  Directive,
  afterNextRender,
  inject,
  linkedSignal,
  untracked,
} from '@angular/core'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import {
  BehaviorSubject,
  Subscription,
  combineLatest,
  map,
  tap,
  distinctUntilChanged,
} from 'rxjs'
import { toSignal } from '@angular/core/rxjs-interop'
import { injectRouter } from './router'
import { routerState$ } from './router-state'

import type { OnInit } from '@angular/core'

@Directive()
export class Transitioner implements OnInit {
  private router = injectRouter()
  private destroyRef = inject(DestroyRef)
  private document = inject(DOCUMENT)
  private cdr = inject(ChangeDetectorRef)

  private matches$ = routerState$({ select: (s) => s.matches })
  private hasPendingMatches$ = this.matches$.pipe(
    map((matches) => matches.some((d) => d.status === 'pending')),
    distinctUntilChanged(),
  )
  private isLoading$ = routerState$({ select: (s) => s.isLoading })
  private previousIsLoading = linkedSignal({
    source: toSignal(this.isLoading$),
    computation: (src, prev) => prev?.source ?? src,
  })

  private isTransitioning$ = new BehaviorSubject(false)
  private isAnyPending$ = combineLatest([
    this.isLoading$,
    this.isTransitioning$,
    this.hasPendingMatches$,
  ]).pipe(
    map(
      ([isLoading, isTransitioning, hasPendingMatches]) =>
        isLoading || isTransitioning || hasPendingMatches,
    ),
    distinctUntilChanged(),
  )

  private previousIsAnyPending = linkedSignal({
    source: toSignal(this.isAnyPending$),
    computation: (src, prev) => prev?.source ?? src,
  })

  private isPagePending$ = combineLatest([
    this.isLoading$,
    this.hasPendingMatches$,
  ]).pipe(
    map(([isLoading, hasPendingMatches]) => isLoading || hasPendingMatches),
    distinctUntilChanged(),
  )
  private previousIsPagePending = linkedSignal({
    source: toSignal(this.isPagePending$),
    computation: (src, prev) => prev?.source ?? src,
  })

  private mountLoadForRouter = { router: this.router, mounted: false }

  private load$ = this.isLoading$.pipe(
    tap((isLoading) => {
      const previousIsLoading = untracked(this.previousIsLoading)
      if (previousIsLoading && !isLoading) {
        this.router.emit({
          type: 'onLoad',
          ...getLocationChangeInfo(this.router.state),
        })
        this.router.__store.setState((s) => ({ ...s, status: 'idle' }))
      }
    }),
  )
  private pagePending$ = this.isPagePending$.pipe(
    tap((isPagePending) => {
      const previousIsPagePending = untracked(this.previousIsPagePending)
      // emit onBeforeRouteMount
      if (previousIsPagePending && !isPagePending) {
        this.router.emit({
          type: 'onBeforeRouteMount',
          ...getLocationChangeInfo(this.router.state),
        })
      }
    }),
  )
  private pending$ = this.isAnyPending$.pipe(
    tap((isAnyPending) => {
      const previousIsAnyPending = untracked(this.previousIsAnyPending)
      // The router was pending and now it's not
      if (previousIsAnyPending && !isAnyPending) {
        this.router.emit({
          type: 'onResolved',
          ...getLocationChangeInfo(this.router.state),
        })

        this.router.__store.setState((s) => ({
          ...s,
          status: 'idle',
          resolvedLocation: s.location,
        }))
        if (
          typeof this.document !== 'undefined' &&
          'querySelector' in this.document
        ) {
          const hashScrollIntoViewOptions =
            this.router.state.location.state.__hashScrollIntoViewOptions ?? true

          if (
            hashScrollIntoViewOptions &&
            this.router.state.location.hash !== ''
          ) {
            const el = this.document.getElementById(
              this.router.state.location.hash,
            )
            if (el) el.scrollIntoView(hashScrollIntoViewOptions)
          }
        }
      }
    }),
  )

  constructor() {
    if (!this.router.isServer) {
      this.router.startTransition = (fn) => {
        this.isTransitioning$.next(true)
        fn()
        this.isTransitioning$.next(false)
        this.cdr.detectChanges()
      }
    }

    const subscription = new Subscription()

    // Try to load the initial location
    afterNextRender(() => {
      untracked(() => {
        const window = this.document.defaultView
        if (
          (typeof window !== 'undefined' && this.router.clientSsr) ||
          (this.mountLoadForRouter.router === this.router &&
            this.mountLoadForRouter.mounted)
        ) {
          return
        }
        this.mountLoadForRouter = { router: this.router, mounted: true }
        const tryLoad = async () => {
          try {
            await this.router.load()
            this.router.__store.setState((s) => ({ ...s, status: 'idle' }))
          } catch (err) {
            console.error(err)
          }
        }
        void tryLoad()
      })

      subscription.add(this.load$.subscribe())
      subscription.add(this.pagePending$.subscribe())
      subscription.add(this.pending$.subscribe())
    })

    this.destroyRef.onDestroy(() => subscription.unsubscribe())
  }

  ngOnInit() {
    // Subscribe to location changes
    // and try to load the new location
    const unsub = this.router.history.subscribe(() => this.router.load())

    const nextLocation = this.router.buildLocation({
      to: this.router.latestLocation.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    })

    if (
      trimPathRight(this.router.latestLocation.href) !==
      trimPathRight(nextLocation.href)
    ) {
      void this.router.commitLocation({ ...nextLocation, replace: true })
    }

    this.destroyRef.onDestroy(() => unsub())
  }
}
