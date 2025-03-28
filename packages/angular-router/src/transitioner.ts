import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectorRef,
  DestroyRef,
  Directive,
  inject,
  OnInit,
  untracked,
} from '@angular/core';
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core';
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  map,
  pairwise,
  Subscription,
  tap,
} from 'rxjs';
import { injectRouter } from './router';
import { routerState$ } from './router-state';

@Directive()
export class Transitioner implements OnInit {
  private router = injectRouter();
  private destroyRef = inject(DestroyRef);
  private document = inject(DOCUMENT);
  private cdr = inject(ChangeDetectorRef);

  private matches$ = routerState$({ select: (s) => s.matches });
  private hasPendingMatches$ = this.matches$.pipe(
    map((matches) => matches.some((d) => d.status === 'pending')),
    distinctUntilChanged(() => false)
  );
  private isLoading$ = routerState$({
    select: (s) => s.isLoading,
    equal: () => false,
  });
  private previousIsLoading$ = this.isLoading$.pipe(
    pairwise(),
    map(([prev, curr]) => prev ?? curr)
  );

  private isTransitioning$ = new BehaviorSubject(false);
  private isAnyPending$ = combineLatest([
    this.isLoading$,
    this.isTransitioning$,
    this.hasPendingMatches$,
  ]).pipe(
    map(
      ([isLoading, isTransitioning, hasPendingMatches]) =>
        isLoading || isTransitioning || hasPendingMatches
    ),
    distinctUntilChanged(() => false)
  );
  private previousIsAnyPending$ = this.isAnyPending$.pipe(
    pairwise(),
    map(([prev, curr]) => prev ?? curr)
  );

  private isPagePending$ = combineLatest([
    this.isLoading$,
    this.hasPendingMatches$,
  ]).pipe(
    map(([isLoading, hasPendingMatches]) => isLoading || hasPendingMatches),
    distinctUntilChanged(() => false)
  );
  private previousIsPagePending$ = this.isPagePending$.pipe(
    pairwise(),
    map(([prev, curr]) => prev ?? curr)
  );

  private mountLoadForRouter = { router: this.router, mounted: false };

  private load$ = combineLatest([
    this.previousIsLoading$,
    this.isLoading$,
  ]).pipe(
    tap(([previousIsLoading, isLoading]) => {
      if (previousIsLoading && !isLoading) {
        this.router.emit({
          type: 'onLoad',
          ...getLocationChangeInfo(this.router.state),
        });
        this.router.__store.setState((s) => ({ ...s, status: 'idle' }));
      }
    })
  );
  private pagePending$ = combineLatest([
    this.previousIsPagePending$,
    this.isPagePending$,
  ]).pipe(
    tap(([previousIsPagePending, isPagePending]) => {
      // emit onBeforeRouteMount
      if (previousIsPagePending && !isPagePending) {
        this.router.emit({
          type: 'onBeforeRouteMount',
          ...getLocationChangeInfo(this.router.state),
        });
      }
    })
  );
  private pending$ = combineLatest([
    this.previousIsAnyPending$,
    this.isAnyPending$,
  ]).pipe(
    tap(([previousIsAnyPending, isAnyPending]) => {
      // The router was pending and now it's not
      if (previousIsAnyPending && !isAnyPending) {
        this.router.emit({
          type: 'onResolved',
          ...getLocationChangeInfo(this.router.state),
        });

        this.router.__store.setState((s) => ({
          ...s,
          status: 'idle',
          resolvedLocation: s.location,
        }));
        if (
          typeof this.document !== 'undefined' &&
          'querySelector' in this.document
        ) {
          const hashScrollIntoViewOptions =
            this.router.state.location.state.__hashScrollIntoViewOptions ??
            true;

          if (
            hashScrollIntoViewOptions &&
            this.router.state.location.hash !== ''
          ) {
            const el = this.document.getElementById(
              this.router.state.location.hash
            );
            if (el) el.scrollIntoView(hashScrollIntoViewOptions);
          }
        }
      }
    })
  );

  constructor() {
    if (!this.router.isServer) {
      this.router.startTransition = (fn) => {
        this.isTransitioning$.next(true);
        fn();
        this.isTransitioning$.next(false);
        this.cdr.detectChanges();
      };
    }

    const subscription = new Subscription();

    // Try to load the initial location
    afterNextRender(() => {
      untracked(() => {
        const window = this.document.defaultView;
        if (
          (typeof window !== 'undefined' && this.router.clientSsr) ||
          (this.mountLoadForRouter.router === this.router &&
            this.mountLoadForRouter.mounted)
        ) {
          return;
        }
        this.mountLoadForRouter = { router: this.router, mounted: true };
        const tryLoad = async () => {
          try {
            await this.router.load();
            this.router.__store.setState((s) => ({ ...s, status: 'idle' }));
          } catch (err) {
            console.error(err);
          }
        };
        void tryLoad();
      });

      subscription.add(this.load$.subscribe());
      subscription.add(this.pagePending$.subscribe());
      subscription.add(this.pending$.subscribe());
    });

    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  ngOnInit() {
    // Subscribe to location changes
    // and try to load the new location
    const unsub = this.router.history.subscribe(() => this.router.load());

    const nextLocation = this.router.buildLocation({
      to: this.router.latestLocation.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    });

    if (
      trimPathRight(this.router.latestLocation.href) !==
      trimPathRight(nextLocation.href)
    ) {
      void this.router.commitLocation({ ...nextLocation, replace: true });
    }

    this.destroyRef.onDestroy(() => unsub());
  }
}
