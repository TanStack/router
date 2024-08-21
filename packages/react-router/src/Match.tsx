'use client'

import * as React from 'react'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { createControlledPromise, pick } from './utils'
import { CatchNotFound, isNotFound } from './not-found'
import { isRedirect } from './redirects'
import { matchContext } from './matchContext'
import { defaultDeserializeError, isServerSideError } from './isServerSideError'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import { rootRouteId } from './root'
import type { AnyRoute } from './route'

export const Match = React.memo(function MatchImpl({
  matchId,
}: {
  matchId: string
}) {
  const router = useRouter()
  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId)?.routeId as string,
  })

  invariant(
    routeId,
    `Could not find routeId for matchId "${matchId}". Please file an issue!`,
  )

  const route: AnyRoute = router.routesById[routeId]

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

  const ResolvedSuspenseBoundary =
    // If we're on the root route, allow forcefully wrapping in suspense
    (!route.isRoot || route.options.wrapInSuspense) &&
    (route.options.wrapInSuspense ??
      PendingComponent ??
      (route.options.errorComponent as any)?.preload)
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

  return (
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
                (error.routeId && error.routeId !== routeId) ||
                (!error.routeId && !route.isRoot)
              )
                throw error

              return React.createElement(routeNotFoundComponent, error as any)
            }}
          >
            <MatchInner matchId={matchId} />
          </ResolvedNotFoundBoundary>
        </ResolvedCatchBoundary>
      </ResolvedSuspenseBoundary>
    </matchContext.Provider>
  )
})

export const MatchInner = React.memo(function MatchInnerImpl({
  matchId,
}: {
  matchId: string
}): any {
  const router = useRouter()

  const { match, matchIndex, routeId } = useRouterState({
    select: (s) => {
      const matchIndex = s.matches.findIndex((d) => d.id === matchId)
      const match = s.matches[matchIndex]!
      const routeId = match.routeId as string
      return {
        routeId,
        matchIndex,
        match: pick(match, ['id', 'status', 'error', 'loadPromise']),
      }
    },
  })

  const route = router.routesById[routeId]!

  const out = React.useMemo(() => {
    const Comp = route.options.component ?? router.options.defaultComponent
    return Comp ? <Comp key={routeId} /> : <Outlet />
  }, [routeId, route.options.component, router.options.defaultComponent])

  // function useChangedDiff(value: any) {
  //   const ref = React.useRef(value)
  //   const changed = ref.current !== value
  //   if (changed) {
  //     console.log(
  //       'Changed:',
  //       value,
  //       Object.fromEntries(
  //         Object.entries(value).filter(
  //           ([key, val]) => val !== ref.current[key],
  //         ),
  //       ),
  //     )
  //   }
  //   ref.current = value
  // }

  // useChangedDiff(match)

  const RouteErrorComponent =
    (route.options.errorComponent ?? router.options.defaultErrorComponent) ||
    ErrorComponent

  if (match.status === 'notFound') {
    let error: unknown
    if (isServerSideError(match.error)) {
      const deserializeError =
        router.options.errorSerializer?.deserialize ?? defaultDeserializeError

      error = deserializeError(match.error.data)
    } else {
      error = match.error
    }

    invariant(isNotFound(error), 'Expected a notFound error')

    return renderRouteNotFound(router, route, error)
  }

  if (match.status === 'redirected') {
    // Redirects should be handled by the router transition. If we happen to
    // encounter a redirect here, it's a bug. Let's warn, but render nothing.
    invariant(isRedirect(match.error), 'Expected a redirect error')

    // warning(
    //   false,
    //   'Tried to render a redirected route match! This is a weird circumstance, please file an issue!',
    // )
    throw match.loadPromise
  }

  if (match.status === 'error') {
    // If we're on the server, we need to use React's new and super
    // wonky api for throwing errors from a server side render inside
    // of a suspense boundary. This is the only way to get
    // renderToPipeableStream to not hang indefinitely.
    // We'll serialize the error and rethrow it on the client.
    if (router.isServer) {
      return (
        <RouteErrorComponent
          error={match.error}
          info={{
            componentStack: '',
          }}
        />
      )
    }

    if (isServerSideError(match.error)) {
      const deserializeError =
        router.options.errorSerializer?.deserialize ?? defaultDeserializeError
      throw deserializeError(match.error.data)
    } else {
      throw match.error
    }
  }

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
    throw match.loadPromise
  }

  return (
    <>
      {out}
      {router.AfterEachMatch ? (
        <router.AfterEachMatch match={match} matchIndex={matchIndex} />
      ) : null}
    </>
  )
})

export const Outlet = React.memo(function OutletImpl() {
  const router = useRouter()
  const matchId = React.useContext(matchContext)
  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId)?.routeId as string,
  })

  const route = router.routesById[routeId]!

  const { parentGlobalNotFound } = useRouterState({
    select: (s) => {
      const matches = s.matches
      const parentMatch = matches.find((d) => d.id === matchId)
      invariant(
        parentMatch,
        `Could not find parent match for matchId "${matchId}"`,
      )
      return {
        parentGlobalNotFound: parentMatch.globalNotFound,
      }
    },
  })

  const childMatchId = useRouterState({
    select: (s) => {
      const matches = s.matches
      const index = matches.findIndex((d) => d.id === matchId)
      return matches[index + 1]?.id
    },
  })

  if (parentGlobalNotFound) {
    return renderRouteNotFound(router, route, undefined)
  }

  if (!childMatchId) {
    return null
  }

  const nextMatch = <Match matchId={childMatchId} />

  const pendingElement = router.options.defaultPendingComponent ? (
    <router.options.defaultPendingComponent />
  ) : null

  if (matchId === rootRouteId) {
    return (
      <React.Suspense fallback={pendingElement}>{nextMatch}</React.Suspense>
    )
  }

  return nextMatch
})
