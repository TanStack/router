import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import {
  createControlledPromise,
  getLocationChangeInfo,
  invariant,
  isNotFound,
  isRedirect,
  rootRouteId,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { matchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import { ClientOnly } from './ClientOnly'
import type {
  AnyRoute,
  ParsedLocation,
  RootRouteOptions,
} from '@tanstack/router-core'

export const Match = React.memo(function MatchImpl({
  matchId,
}: {
  matchId: string
}) {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    const match = router.stores.activeMatchStoresById.get(matchId)?.state
    if (!match) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invariant failed: Could not find match for matchId "${matchId}". Please file an issue!`,
        )
      }

      invariant()
    }

    const routeId = match.routeId as string
    const parentRouteId = (router.routesById[routeId] as AnyRoute).parentRoute
      ?.id

    return (
      <MatchView
        router={router}
        matchId={matchId}
        resetKey={router.stores.loadedAt.state}
        matchState={{
          routeId,
          ssr: match.ssr,
          _displayPending: match._displayPending,
          parentRouteId,
        }}
      />
    )
  }

  // Subscribe directly to the match store from the pool.
  // The matchId prop is stable for this component's lifetime (set by Outlet),
  // and reconcileMatchPool reuses stores for the same matchId.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const matchStore = router.stores.activeMatchStoresById.get(matchId)
  if (!matchStore) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        `Invariant failed: Could not find match for matchId "${matchId}". Please file an issue!`,
      )
    }

    invariant()
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const resetKey = useStore(router.stores.loadedAt, (loadedAt) => loadedAt)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const match = useStore(matchStore, (value) => value)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const matchState = React.useMemo(() => {
    const routeId = match.routeId as string
    const parentRouteId = (router.routesById[routeId] as AnyRoute).parentRoute
      ?.id

    return {
      routeId,
      ssr: match.ssr,
      _displayPending: match._displayPending,
      parentRouteId: parentRouteId as string | undefined,
    } satisfies MatchViewState
  }, [match._displayPending, match.routeId, match.ssr, router.routesById])

  return (
    <MatchView
      router={router}
      matchId={matchId}
      resetKey={resetKey}
      matchState={matchState}
    />
  )
})

type MatchViewState = {
  routeId: string
  ssr: boolean | 'data-only' | undefined
  _displayPending: boolean | undefined
  parentRouteId: string | undefined
}

function MatchView({
  router,
  matchId,
  resetKey,
  matchState,
}: {
  router: ReturnType<typeof useRouter>
  matchId: string
  resetKey: number
  matchState: MatchViewState
}) {
  const route: AnyRoute = router.routesById[matchState.routeId]

  const PendingComponent =
    route.options.pendingComponent ?? router.options.defaultPendingComponent

  const pendingElement = PendingComponent ? <PendingComponent /> : null

  const routeErrorComponent =
    route.options.errorComponent ?? router.options.defaultErrorComponent

  const routeOnCatch = route.options.onCatch ?? router.options.defaultOnCatch

  const routeNotFoundComponent = route.isRoot
    ? // If it's the root route, use the globalNotFound option, with fallback to the notFoundRoute's component
      (route.options.notFoundComponent ??
      router.options.notFoundRoute?.options.component)
    : route.options.notFoundComponent

  const resolvedNoSsr =
    matchState.ssr === false || matchState.ssr === 'data-only'
  const ResolvedSuspenseBoundary =
    // If we're on the root route, allow forcefully wrapping in suspense
    (!route.isRoot || route.options.wrapInSuspense || resolvedNoSsr) &&
    (route.options.wrapInSuspense ??
      PendingComponent ??
      ((route.options.errorComponent as any)?.preload || resolvedNoSsr))
      ? React.Suspense
      : SafeFragment

  const ResolvedCatchBoundary = routeErrorComponent
    ? CatchBoundary
    : SafeFragment

  const ResolvedNotFoundBoundary = routeNotFoundComponent
    ? CatchNotFound
    : SafeFragment

  const ShellComponent = route.isRoot
    ? ((route.options as RootRouteOptions).shellComponent ?? SafeFragment)
    : SafeFragment
  return (
    <ShellComponent>
      <matchContext.Provider value={matchId}>
        <ResolvedSuspenseBoundary fallback={pendingElement}>
          <ResolvedCatchBoundary
            getResetKey={() => resetKey}
            errorComponent={routeErrorComponent || ErrorComponent}
            onCatch={(error, errorInfo) => {
              // Forward not found errors (we don't want to show the error component for these)
              if (isNotFound(error)) throw error
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`Warning: Error in route match: ${matchId}`)
              }
              routeOnCatch?.(error, errorInfo)
            }}
          >
            <ResolvedNotFoundBoundary
              fallback={(error) => {
                // If the current not found handler doesn't exist or it has a
                // route ID which doesn't match the current route, rethrow the error
                if (
                  !routeNotFoundComponent ||
                  (error.routeId && error.routeId !== matchState.routeId) ||
                  (!error.routeId && !route.isRoot)
                )
                  throw error

                return React.createElement(routeNotFoundComponent, error as any)
              }}
            >
              {resolvedNoSsr || matchState._displayPending ? (
                <ClientOnly fallback={pendingElement}>
                  <MatchInner matchId={matchId} />
                </ClientOnly>
              ) : (
                <MatchInner matchId={matchId} />
              )}
            </ResolvedNotFoundBoundary>
          </ResolvedCatchBoundary>
        </ResolvedSuspenseBoundary>
      </matchContext.Provider>
      {matchState.parentRouteId === rootRouteId &&
      router.options.scrollRestoration ? (
        <>
          <OnRendered />
          <ScrollRestoration />
        </>
      ) : null}
    </ShellComponent>
  )
}

// On Rendered can't happen above the root layout because it actually
// renders a dummy dom element to track the rendered state of the app.
// We render a script tag with a key that changes based on the current
// location state.__TSR_key. Also, because it's below the root layout, it
// allows us to fire onRendered events even after a hydration mismatch
// error that occurred above the root layout (like bad head/link tags,
// which is common).
function OnRendered() {
  const router = useRouter()

  const prevLocationRef = React.useRef<undefined | ParsedLocation<{}>>(
    undefined,
  )

  return (
    <script
      key={router.latestLocation.state.__TSR_key}
      suppressHydrationWarning
      ref={(el) => {
        if (
          el &&
          (prevLocationRef.current === undefined ||
            prevLocationRef.current.href !== router.latestLocation.href)
        ) {
          router.emit({
            type: 'onRendered',
            ...getLocationChangeInfo(
              router.stores.location.state,
              router.stores.resolvedLocation.state,
            ),
          })
          prevLocationRef.current = router.latestLocation
        }
      }}
    />
  )
}

export const MatchInner = React.memo(function MatchInnerImpl({
  matchId,
}: {
  matchId: string
}): any {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    const match = router.stores.activeMatchStoresById.get(matchId)?.state
    if (!match) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invariant failed: Could not find match for matchId "${matchId}". Please file an issue!`,
        )
      }

      invariant()
    }

    const routeId = match.routeId as string
    const route = router.routesById[routeId] as AnyRoute
    const remountFn =
      (router.routesById[routeId] as AnyRoute).options.remountDeps ??
      router.options.defaultRemountDeps
    const remountDeps = remountFn?.({
      routeId,
      loaderDeps: match.loaderDeps,
      params: match._strictParams,
      search: match._strictSearch,
    })
    const key = remountDeps ? JSON.stringify(remountDeps) : undefined
    const Comp = route.options.component ?? router.options.defaultComponent
    const out = Comp ? <Comp key={key} /> : <Outlet />

    if (match._displayPending) {
      throw router.getMatch(match.id)?._nonReactive.displayPendingPromise
    }

    if (match._forcePending) {
      throw router.getMatch(match.id)?._nonReactive.minPendingPromise
    }

    if (match.status === 'pending') {
      throw router.getMatch(match.id)?._nonReactive.loadPromise
    }

    if (match.status === 'notFound') {
      if (!isNotFound(match.error)) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error('Invariant failed: Expected a notFound error')
        }

        invariant()
      }
      return renderRouteNotFound(router, route, match.error)
    }

    if (match.status === 'redirected') {
      if (!isRedirect(match.error)) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error('Invariant failed: Expected a redirect error')
        }

        invariant()
      }
      throw router.getMatch(match.id)?._nonReactive.loadPromise
    }

    if (match.status === 'error') {
      const RouteErrorComponent =
        (route.options.errorComponent ??
          router.options.defaultErrorComponent) ||
        ErrorComponent
      return (
        <RouteErrorComponent
          error={match.error as any}
          reset={undefined as any}
          info={{
            componentStack: '',
          }}
        />
      )
    }

    return out
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const matchStore = router.stores.activeMatchStoresById.get(matchId)
  if (!matchStore) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        `Invariant failed: Could not find match for matchId "${matchId}". Please file an issue!`,
      )
    }

    invariant()
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const match = useStore(matchStore, (value) => value)
  const routeId = match.routeId as string
  const route = router.routesById[routeId] as AnyRoute
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const key = React.useMemo(() => {
    const remountFn =
      (router.routesById[routeId] as AnyRoute).options.remountDeps ??
      router.options.defaultRemountDeps
    const remountDeps = remountFn?.({
      routeId,
      loaderDeps: match.loaderDeps,
      params: match._strictParams,
      search: match._strictSearch,
    })
    return remountDeps ? JSON.stringify(remountDeps) : undefined
  }, [
    routeId,
    match.loaderDeps,
    match._strictParams,
    match._strictSearch,
    router.options.defaultRemountDeps,
    router.routesById,
  ])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const out = React.useMemo(() => {
    const Comp = route.options.component ?? router.options.defaultComponent
    if (Comp) {
      return <Comp key={key} />
    }
    return <Outlet />
  }, [key, route.options.component, router.options.defaultComponent])

  if (match._displayPending) {
    throw router.getMatch(match.id)?._nonReactive.displayPendingPromise
  }

  if (match._forcePending) {
    throw router.getMatch(match.id)?._nonReactive.minPendingPromise
  }

  // see also hydrate() in packages/router-core/src/ssr/ssr-client.ts
  if (match.status === 'pending') {
    // We're pending, and if we have a minPendingMs, we need to wait for it
    const pendingMinMs =
      route.options.pendingMinMs ?? router.options.defaultPendingMinMs
    if (pendingMinMs) {
      const routerMatch = router.getMatch(match.id)
      if (routerMatch && !routerMatch._nonReactive.minPendingPromise) {
        // Create a promise that will resolve after the minPendingMs
        if (!(isServer ?? router.isServer)) {
          const minPendingPromise = createControlledPromise<void>()

          routerMatch._nonReactive.minPendingPromise = minPendingPromise

          setTimeout(() => {
            minPendingPromise.resolve()
            // We've handled the minPendingPromise, so we can delete it
            routerMatch._nonReactive.minPendingPromise = undefined
          }, pendingMinMs)
        }
      }
    }
    throw router.getMatch(match.id)?._nonReactive.loadPromise
  }

  if (match.status === 'notFound') {
    if (!isNotFound(match.error)) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('Invariant failed: Expected a notFound error')
      }

      invariant()
    }
    return renderRouteNotFound(router, route, match.error)
  }

  if (match.status === 'redirected') {
    // Redirects should be handled by the router transition. If we happen to
    // encounter a redirect here, it's a bug. Let's warn, but render nothing.
    if (!isRedirect(match.error)) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('Invariant failed: Expected a redirect error')
      }

      invariant()
    }

    // warning(
    //   false,
    //   'Tried to render a redirected route match! This is a weird circumstance, please file an issue!',
    // )
    throw router.getMatch(match.id)?._nonReactive.loadPromise
  }

  if (match.status === 'error') {
    // If we're on the server, we need to use React's new and super
    // wonky api for throwing errors from a server side render inside
    // of a suspense boundary. This is the only way to get
    // renderToPipeableStream to not hang indefinitely.
    // We'll serialize the error and rethrow it on the client.
    if (isServer ?? router.isServer) {
      const RouteErrorComponent =
        (route.options.errorComponent ??
          router.options.defaultErrorComponent) ||
        ErrorComponent
      return (
        <RouteErrorComponent
          error={match.error as any}
          reset={undefined as any}
          info={{
            componentStack: '',
          }}
        />
      )
    }

    throw match.error
  }

  return out
})

/**
 * Render the next child match in the route tree. Typically used inside
 * a route component to render nested routes.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/outletComponent
 */
export const Outlet = React.memo(function OutletImpl() {
  const router = useRouter()
  const matchId = React.useContext(matchContext)

  let routeId: string | undefined
  let parentGlobalNotFound = false
  let childMatchId: string | undefined

  if (isServer ?? router.isServer) {
    const matches = router.stores.activeMatchesSnapshot.state
    const parentIndex = matchId
      ? matches.findIndex((match) => match.id === matchId)
      : -1
    const parentMatch = parentIndex >= 0 ? matches[parentIndex] : undefined
    routeId = parentMatch?.routeId as string | undefined
    parentGlobalNotFound = parentMatch?.globalNotFound ?? false
    childMatchId =
      parentIndex >= 0 ? (matches[parentIndex + 1]?.id as string) : undefined
  } else {
    // Subscribe directly to the match store from the pool instead of
    // the two-level byId → matchStore pattern.
    const parentMatchStore = matchId
      ? router.stores.activeMatchStoresById.get(matchId)
      : undefined

    // eslint-disable-next-line react-hooks/rules-of-hooks
    ;[routeId, parentGlobalNotFound] = useStore(parentMatchStore, (match) => [
      match?.routeId as string | undefined,
      match?.globalNotFound ?? false,
    ])

    // eslint-disable-next-line react-hooks/rules-of-hooks
    childMatchId = useStore(router.stores.matchesId, (ids) => {
      const index = ids.findIndex((id) => id === matchId)
      return ids[index + 1]
    })
  }

  const route = routeId ? router.routesById[routeId] : undefined

  const pendingElement = router.options.defaultPendingComponent ? (
    <router.options.defaultPendingComponent />
  ) : null

  if (parentGlobalNotFound) {
    if (!route) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          'Invariant failed: Could not resolve route for Outlet render',
        )
      }

      invariant()
    }
    return renderRouteNotFound(router, route, undefined)
  }

  if (!childMatchId) {
    return null
  }

  const nextMatch = <Match matchId={childMatchId} />

  if (routeId === rootRouteId) {
    return (
      <React.Suspense fallback={pendingElement}>{nextMatch}</React.Suspense>
    )
  }

  return nextMatch
})
