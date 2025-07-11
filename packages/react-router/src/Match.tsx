import * as React from 'react'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  createControlledPromise,
  getLocationChangeInfo,
  isNotFound,
  isRedirect,
  pick,
  rootRouteId,
} from '@tanstack/router-core'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
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
  const matchState = useRouterState({
    select: (s) => {
      const match = s.matches.find((d) => d.id === matchId)
      invariant(
        match,
        `Could not find match for matchId "${matchId}". Please file an issue!`,
      )
      return pick(match, ['routeId', 'ssr', '_displayPending'])
    },
    structuralSharing: true as any,
  })

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

  const resetKey = useRouterState({
    select: (s) => s.loadedAt,
  })

  const parentRouteId = useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((d) => d.id === matchId)
      return s.matches[index - 1]?.routeId as string
    },
  })

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
              warning(false, `Error in route match: ${matchId}`)
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
      {parentRouteId === rootRouteId && router.options.scrollRestoration ? (
        <>
          <OnRendered />
          <ScrollRestoration />
        </>
      ) : null}
    </ShellComponent>
  )
})

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
            ...getLocationChangeInfo(router.state),
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

  const { match, key, routeId } = useRouterState({
    select: (s) => {
      const matchIndex = s.matches.findIndex((d) => d.id === matchId)
      const match = s.matches[matchIndex]!
      const routeId = match.routeId as string

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

      return {
        key,
        routeId,
        match: pick(match, [
          'id',
          'status',
          'error',
          '_forcePending',
          '_displayPending',
        ]),
      }
    },
    structuralSharing: true as any,
  })

  const route = router.routesById[routeId] as AnyRoute

  const out = React.useMemo(() => {
    const Comp = route.options.component ?? router.options.defaultComponent
    if (Comp) {
      return <Comp key={key} />
    }
    return <Outlet />
  }, [key, route.options.component, router.options.defaultComponent])

  if (match._displayPending) {
    throw router.getMatch(match.id)?.displayPendingPromise
  }

  if (match._forcePending) {
    throw router.getMatch(match.id)?.minPendingPromise
  }

  // see also hydrate() in packages/router-core/src/ssr/ssr-client.ts
  if (match.status === 'pending') {
    // We're pending, and if we have a minPendingMs, we need to wait for it
    const pendingMinMs =
      route.options.pendingMinMs ?? router.options.defaultPendingMinMs

    if (pendingMinMs && !router.getMatch(match.id)?.minPendingPromise) {
      // Create a promise that will resolve after the minPendingMs
      if (!router.isServer) {
        const minPendingPromise = createControlledPromise<void>()

        Promise.resolve().then(() => {
          router.updateMatch(match.id, (prev) => ({
            ...prev,
            minPendingPromise,
          }))
        })

        setTimeout(() => {
          minPendingPromise.resolve()

          // We've handled the minPendingPromise, so we can delete it
          router.updateMatch(match.id, (prev) => ({
            ...prev,
            minPendingPromise: undefined,
          }))
        }, pendingMinMs)
      }
    }
    throw router.getMatch(match.id)?.loadPromise
  }

  if (match.status === 'notFound') {
    invariant(isNotFound(match.error), 'Expected a notFound error')
    return renderRouteNotFound(router, route, match.error)
  }

  if (match.status === 'redirected') {
    // Redirects should be handled by the router transition. If we happen to
    // encounter a redirect here, it's a bug. Let's warn, but render nothing.
    invariant(isRedirect(match.error), 'Expected a redirect error')

    // warning(
    //   false,
    //   'Tried to render a redirected route match! This is a weird circumstance, please file an issue!',
    // )
    throw router.getMatch(match.id)?.loadPromise
  }

  if (match.status === 'error') {
    // If we're on the server, we need to use React's new and super
    // wonky api for throwing errors from a server side render inside
    // of a suspense boundary. This is the only way to get
    // renderToPipeableStream to not hang indefinitely.
    // We'll serialize the error and rethrow it on the client.
    if (router.isServer) {
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

export const Outlet = React.memo(function OutletImpl() {
  const router = useRouter()
  const matchId = React.useContext(matchContext)
  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId)?.routeId as string,
  })

  const route = router.routesById[routeId]!

  const parentGlobalNotFound = useRouterState({
    select: (s) => {
      const matches = s.matches
      const parentMatch = matches.find((d) => d.id === matchId)
      invariant(
        parentMatch,
        `Could not find parent match for matchId "${matchId}"`,
      )
      return parentMatch.globalNotFound
    },
  })

  const childMatchId = useRouterState({
    select: (s) => {
      const matches = s.matches
      const index = matches.findIndex((d) => d.id === matchId)
      return matches[index + 1]?.id
    },
  })

  const pendingElement = router.options.defaultPendingComponent ? (
    <router.options.defaultPendingComponent />
  ) : null

  if (parentGlobalNotFound) {
    return renderRouteNotFound(router, route, undefined)
  }

  if (!childMatchId) {
    return null
  }

  const nextMatch = <Match matchId={childMatchId} />

  if (matchId === rootRouteId) {
    return (
      <React.Suspense fallback={pendingElement}>{nextMatch}</React.Suspense>
    )
  }

  return nextMatch
})
