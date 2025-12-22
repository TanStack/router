import * as React from 'react'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  createControlledPromise,
  isNotFound,
  isRedirect,
  rootRouteId,
} from '@tanstack/router-core'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { matchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import type { AnyRoute } from '@tanstack/router-core'

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
      return {
        routeId: match.routeId,
      }
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

  const ResolvedSuspenseBoundary =
    route.options.wrapInSuspense ?? PendingComponent
      ? React.Suspense
      : SafeFragment

  const ResolvedCatchBoundary = routeErrorComponent
    ? CatchBoundary
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
            if (isNotFound(error)) throw error
            warning(false, `Error in route match: ${matchId}`)
            routeOnCatch?.(error, errorInfo)
          }}
        >
          <MatchInner matchId={matchId} />
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

  const { match, key, routeId } = useRouterState({
    select: (s) => {
      const match = s.matches.find((d) => d.id === matchId)!
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
        match: {
          id: match.id,
          status: match.status,
          error: match.error,
          _forcePending: match._forcePending,
          _displayPending: match._displayPending,
        },
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
    throw router.getMatch(match.id)?._nonReactive.displayPendingPromise
  }

  if (match._forcePending) {
    throw router.getMatch(match.id)?._nonReactive.minPendingPromise
  }

  if (match.status === 'pending') {
    const pendingMinMs =
      route.options.pendingMinMs ?? router.options.defaultPendingMinMs
    if (pendingMinMs) {
      const routerMatch = router.getMatch(match.id)
      if (routerMatch && !routerMatch._nonReactive.minPendingPromise) {
        const minPendingPromise = createControlledPromise<void>()

        routerMatch._nonReactive.minPendingPromise = minPendingPromise

        setTimeout(() => {
          minPendingPromise.resolve()
          routerMatch._nonReactive.minPendingPromise = undefined
        }, pendingMinMs)
      }
    }
    throw router.getMatch(match.id)?._nonReactive.loadPromise
  }

  if (match.status === 'notFound') {
    invariant(isNotFound(match.error), 'Expected a notFound error')
    throw match.error
  }

  if (match.status === 'redirected') {
    invariant(isRedirect(match.error), 'Expected a redirect error')
    throw router.getMatch(match.id)?._nonReactive.loadPromise
  }

  if (match.status === 'error') {
    throw match.error
  }

  return out
})

/**
 * Render the next child match in the route tree. Typically used inside
 * a route component to render nested routes.
 */
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
    return null
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
