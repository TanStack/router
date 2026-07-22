'use client'

import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { ReadonlyStore, Store } from '@tanstack/store'
import { getLocationChangeInfo } from '@tanstack/router-core'
import { routerContext } from './routerContext'
import { useRouterRenderer } from './routerRenderer'
import { useLayoutEffect } from './utils'
import type {
  AnyRoute,
  AnyRouteMatch,
  AnyRouter,
  MatchRouteOptions,
  ParsedLocation,
  RegisteredRouter,
  RouterState,
  RouterStores,
} from '@tanstack/router-core'
import type { NavigationBlocker, RouterHistory } from '@tanstack/history'

export type RouterStateSnapshotStore<
  TRouter extends AnyRouter = RegisteredRouter,
> = Store<RouterState<TRouter['routeTree']>>

export type WritableRouterStateSnapshotStore<
  TRouter extends AnyRouter = RegisteredRouter,
> = RouterStateSnapshotStore<TRouter> & {
  set: (state: RouterState<TRouter['routeTree']>) => void
}

const lastRenderedLocations = new WeakMap<AnyRouter, ParsedLocation>()
const activeSnapshotStore = new Store(true)
const emptyMatches: Array<AnyRouteMatch> = []

function createProjectedStore<TValue>(
  store: RouterStateSnapshotStore<AnyRouter>,
  select: (state: RouterState<AnyRoute>) => TValue,
) {
  return new ReadonlyStore(() => select(store.get()))
}

class SnapshotMatchStoreMap extends Map<string, any> {
  constructor(private store: RouterStateSnapshotStore<AnyRouter>) {
    super()
  }

  override get(matchId: string) {
    let matchStore = super.get(matchId)
    if (!matchStore) {
      matchStore = createProjectedStore(this.store, (state) =>
        state.matches.find((match) => match.id === matchId),
      )
      super.set(matchId, matchStore)
    }
    return matchStore
  }
}

function createSnapshotRouterStores(
  store: RouterStateSnapshotStore<AnyRouter>,
): RouterStores<AnyRoute> {
  const matchStores = new SnapshotMatchStoreMap(store)
  const routeMatchStores = new Map<string, ReadonlyStore<any>>()
  const projected = <TValue,>(
    select: (state: RouterState<AnyRoute>) => TValue,
  ) => createProjectedStore(store, select)

  return {
    status: projected((state) => state.status),
    loadedAt: projected((state) => state.loadedAt),
    isLoading: projected((state) => state.isLoading),
    isTransitioning: projected((state) => state.isTransitioning),
    location: projected((state) => state.location),
    resolvedLocation: projected((state) => state.resolvedLocation),
    statusCode: projected((state) => state.statusCode),
    redirect: projected((state) => state.redirect),
    matchesId: projected((state) => state.matches.map((match) => match.id)),
    pendingIds: new Store<Array<string>>([]),
    cachedIds: new Store<Array<string>>([]),
    matches: projected((state) => state.matches),
    pendingMatches: new Store(emptyMatches),
    cachedMatches: new Store(emptyMatches),
    firstId: projected((state) => state.matches[0]?.id),
    hasPending: projected((state) =>
      state.matches.some((match) => match.status === 'pending'),
    ),
    matchRouteDeps: projected((state) => ({
      locationHref: state.location.href,
      resolvedLocationHref: state.resolvedLocation?.href,
      status: state.status,
    })),
    __store: store,
    matchStores,
    pendingMatchStores: new Map(),
    cachedMatchStores: new Map(),
    getRouteMatchStore(routeId: string) {
      let routeMatchStore = routeMatchStores.get(routeId)
      if (!routeMatchStore) {
        routeMatchStore = projected((state) =>
          state.matches.find((match) => match.routeId === routeId),
        )
        routeMatchStores.set(routeId, routeMatchStore)
      }
      return routeMatchStore
    },
    setMatches() {},
    setPending() {},
    setCached() {},
  } as unknown as RouterStores<AnyRoute>
}

function createActiveHistory(
  history: RouterHistory,
  activeStore: Store<boolean>,
): RouterHistory {
  const activeHistory = Object.create(history) as RouterHistory
  activeHistory.block = (blocker: NavigationBlocker) => {
    let unblock: (() => void) | undefined
    const setActive = (active: boolean) => {
      if (active && !unblock) {
        unblock = history.block(blocker)
      } else if (!active && unblock) {
        unblock()
        unblock = undefined
      }
    }

    setActive(activeStore.get())
    const subscription = activeStore.subscribe(setActive)

    return () => {
      subscription.unsubscribe()
      unblock?.()
      unblock = undefined
    }
  }
  return activeHistory
}

export function createRouterStateSnapshotStore<TRouter extends AnyRouter>(
  initialState: RouterState<TRouter['routeTree']>,
): WritableRouterStateSnapshotStore<TRouter> {
  const store = new Store(
    initialState,
  ) as WritableRouterStateSnapshotStore<TRouter>
  store.set = (nextState) => {
    store.setState((previousState) =>
      nextState === previousState ? previousState : nextState,
    )
  }
  return store
}

export function createRouterStateSnapshotRouter<TRouter extends AnyRouter>(
  router: TRouter,
  store: RouterStateSnapshotStore<TRouter>,
  options: {
    activeStore?: Store<boolean>
    renderer?: ReturnType<typeof useRouterRenderer>
  } = {},
): TRouter {
  const snapshotStore = store as unknown as RouterStateSnapshotStore<AnyRouter>
  const snapshotRouter = Object.create(router) as TRouter
  const renderer = options.renderer
  const snapshotHistory = options.activeStore
    ? createActiveHistory(router.history, options.activeStore)
    : router.history
  const snapshotOptions = renderer
    ? Object.assign(Object.create(router.options), {
        defaultErrorComponent:
          router.options.defaultErrorComponent ?? renderer.errorComponent,
        defaultNotFoundComponent:
          router.options.defaultNotFoundComponent ?? renderer.notFoundComponent,
      })
    : router.options

  Object.defineProperties(snapshotRouter, {
    stores: {
      configurable: true,
      enumerable: true,
      value: createSnapshotRouterStores(snapshotStore),
    },
    history: {
      configurable: true,
      enumerable: true,
      value: snapshotHistory,
    },
    options: {
      configurable: true,
      enumerable: true,
      value: snapshotOptions,
    },
    matchRoute: {
      configurable: true,
      enumerable: true,
      value: (location: any, matchOptions?: MatchRouteOptions) => {
        const state = snapshotStore.get()
        return router.matchRoute(location, {
          ...matchOptions,
          _baseLocation:
            matchOptions?.pending === true
              ? undefined
              : (state.resolvedLocation ?? state.location),
        })
      },
    },
    emit: {
      configurable: true,
      enumerable: true,
      value: (event: any) => {
        if (event.type !== 'onRendered') {
          router.emit(event)
        }
      },
    },
  })

  return snapshotRouter
}

export function RouterStateSnapshotProvider<TRouter extends AnyRouter>({
  router,
  store,
  activeStore,
  children,
}: {
  router: TRouter
  store: RouterStateSnapshotStore<TRouter>
  activeStore?: Store<boolean>
  children: React.ReactNode
}) {
  const renderer = useRouterRenderer()
  const snapshotRouter = React.useMemo(
    () =>
      createRouterStateSnapshotRouter(router, store, {
        activeStore,
        renderer,
      }),
    [activeStore, renderer, router, store],
  )

  return (
    <routerContext.Provider value={snapshotRouter as AnyRouter}>
      {children}
      <SnapshotRenderedReporter
        router={router}
        store={store}
        activeStore={activeStore}
      />
    </routerContext.Provider>
  )
}

function SnapshotRenderedReporter({
  router,
  store,
  activeStore,
}: {
  router: AnyRouter
  store: RouterStateSnapshotStore<AnyRouter>
  activeStore?: Store<boolean>
}) {
  const active = useStore(activeStore ?? activeSnapshotStore, (value) => value)
  const location = useStore(
    store,
    (state) => state.resolvedLocation ?? state.location,
  )

  useLayoutEffect(() => {
    const previousLocation = lastRenderedLocations.get(router)
    if (!active || previousLocation?.href === location.href) {
      return
    }

    router.emit({
      type: 'onRendered',
      ...getLocationChangeInfo(location, previousLocation ?? location),
    })
    lastRenderedLocations.set(router, location)
  }, [active, location, router])

  return null
}
