'use client'

import * as React from 'react'
import { Store } from '@tanstack/store'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'

export type RouterStateSnapshotStore<
  TRouter extends AnyRouter = RegisteredRouter,
> = Store<RouterState<TRouter['routeTree']>>

export type WritableRouterStateSnapshotStore<
  TRouter extends AnyRouter = RegisteredRouter,
> = RouterStateSnapshotStore<TRouter> & {
  set: (state: RouterState<TRouter['routeTree']>) => void
}

interface RouterStateSnapshotContextValue {
  router: AnyRouter
  store: RouterStateSnapshotStore<AnyRouter>
  activeStore?: Store<boolean>
}

const routerStateSnapshotContext = React.createContext<
  RouterStateSnapshotContextValue | undefined
>(undefined)

/**
 * Create a small external store for rendering a stable router-state snapshot.
 * Native navigation adapters use one store per native screen so inactive
 * screens keep their own match tree while an interactive back gesture runs.
 */
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
  return (
    <routerStateSnapshotContext.Provider
      value={{
        router,
        store: store as unknown as RouterStateSnapshotStore<AnyRouter>,
        activeStore,
      }}
    >
      {children}
    </routerStateSnapshotContext.Provider>
  )
}

export function useRouterStateSnapshotStore(router: AnyRouter) {
  const context = React.useContext(routerStateSnapshotContext)
  return context?.router === router ? context.store : undefined
}

export function useRouterStateSnapshotActiveStore(router: AnyRouter) {
  const context = React.useContext(routerStateSnapshotContext)
  return context?.router === router ? context.activeStore : undefined
}
