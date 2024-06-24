'use client'

/* eslint-disable no-shadow */
import * as React from 'react'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { createControlledPromise, pick } from './utils'
import { CatchNotFound, isNotFound } from './not-found'
import { isRedirect } from './redirects'
import { type AnyRoute } from './route'
import { matchContext } from './matchContext'
import { defaultDeserializeError, isServerSideError } from './isServerSideError'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import { rootRouteId } from './root'

export function Match({ matchId }: { matchId: string }) {
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
      route.options.notFoundComponent ??
      router.options.notFoundRoute?.options.component
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
    select: (s) => s.resolvedLocation.state.key!,
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
}
function MatchInner({ matchId }: { matchId: string }): any {
  const router = useRouter()
  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId)?.routeId as string,
  })

  const route = router.routesById[routeId]!

  const [match, matchIndex] = useRouterState({
    select: (s) => {
      const matchIndex = s.matches.findIndex((d) => d.id === matchId)
      const match = s.matches[matchIndex]!
      return [
        pick(match, [
          'id',
          'status',
          'error',
          'loadPromise',
          'minPendingPromise',
        ]),
        matchIndex,
      ] as const
    },
  })

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

    if (pendingMinMs && !match.minPendingPromise) {
      // Create a promise that will resolve after the minPendingMs
      match.minPendingPromise = createControlledPromise()

      if (!router.isServer) {
        Promise.resolve().then(() => {
          router.__store.setState((s) => ({
            ...s,
            matches: s.matches.map((d) =>
              d.id === match.id
                ? { ...d, minPendingPromise: createControlledPromise() }
                : d,
            ),
          }))
        })

        setTimeout(() => {
          // We've handled the minPendingPromise, so we can delete it
          router.__store.setState((s) => {
            return {
              ...s,
              matches: s.matches.map((d) =>
                d.id === match.id
                  ? {
                      ...d,
                      minPendingPromise:
                        (d.minPendingPromise?.resolve(), undefined),
                    }
                  : d,
              ),
            }
          })
        }, pendingMinMs)
      }
    }

    throw match.loadPromise
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (match.status === 'success') {
    const Comp = route.options.component ?? router.options.defaultComponent

    const out = Comp ? <Comp /> : <Outlet />

    return (
      <>
        {router.AfterEachMatch ? (
          <router.AfterEachMatch match={match} matchIndex={matchIndex} />
        ) : null}
        {out}
      </>
    )
  }

  invariant(
    false,
    'Idle routeMatch status encountered during rendering! You should never see this. File an issue!',
  )
}

export const Outlet = React.memo(function Outlet() {
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
