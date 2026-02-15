import { h } from 'preact'
import { useContext, useMemo, useRef } from 'preact/hooks'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  createControlledPromise,
  getLocationChangeInfo,
  isNotFound,
  isRedirect,
  rootRouteId,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { matchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { Suspense } from './Suspense'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import { ClientOnly } from './ClientOnly'
import type {
  AnyRoute,
  ParsedLocation,
  RootRouteOptions,
} from '@tanstack/router-core'

// No React.memo in Preact without compat - just use plain function components
export function Match({ matchId }: { matchId: string }) {
  const router = useRouter()
  const matchState = useRouterState({
    select: (s) => {
      const matchIndex = s.matches.findIndex((d) => d.id === matchId)
      const match = s.matches[matchIndex]
      invariant(
        match,
        `Could not find match for matchId "${matchId}". Please file an issue!`,
      )
      return {
        routeId: match.routeId,
        ssr: match.ssr,
        _displayPending: match._displayPending,
        resetKey: s.loadedAt,
        parentRouteId: s.matches[matchIndex - 1]?.routeId as string,
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

  const routeNotFoundComponent = route.isRoot
    ? (route.options.notFoundComponent ??
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
      ? Suspense
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
        <ResolvedSuspenseBoundary>
          <ResolvedCatchBoundary
            getResetKey={() => matchState.resetKey}
            errorComponent={routeErrorComponent || ErrorComponent}
            onCatch={(error, errorInfo) => {
              if (isNotFound(error)) throw error
              warning(false, `Error in route match: ${matchId}`)
              routeOnCatch?.(error, errorInfo)
            }}
          >
            <ResolvedNotFoundBoundary
              fallback={(error) => {
                if (
                  !routeNotFoundComponent ||
                  (error.routeId && error.routeId !== matchState.routeId) ||
                  (!error.routeId && !route.isRoot)
                )
                  throw error

                return h(routeNotFoundComponent, error as any) as any
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

function OnRendered() {
  const router = useRouter()

  const prevLocationRef = useRef<undefined | ParsedLocation<{}>>(
    undefined,
  )

  return (
    <script
      key={router.latestLocation.state.__TSR_key}
      ref={(el: HTMLScriptElement | null) => {
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

export function MatchInner({
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
          invalid: match.invalid,
          _forcePending: match._forcePending,
          _displayPending: match._displayPending,
        },
      }
    },
    structuralSharing: true as any,
  })

  const route = router.routesById[routeId] as AnyRoute

  const out = useMemo(() => {
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
        if (!(isServer ?? router.isServer)) {
          const minPendingPromise = createControlledPromise<void>()

          routerMatch._nonReactive.minPendingPromise = minPendingPromise

          setTimeout(() => {
            minPendingPromise.resolve()
            routerMatch._nonReactive.minPendingPromise = undefined
          }, pendingMinMs)
        }
      }
    }
    throw router.getMatch(match.id)?._nonReactive.loadPromise
  }

  if (match.status === 'notFound') {
    invariant(isNotFound(match.error), 'Expected a notFound error')
    return renderRouteNotFound(router, route, match.error)
  }

  if (match.status === 'redirected') {
    invariant(isRedirect(match.error), 'Expected a redirect error')
    throw router.getMatch(match.id)?._nonReactive.loadPromise
  }

  if (match.status === 'error') {
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
}

/**
 * Render the next child match in the route tree.
 */
export function Outlet() {
  const router = useRouter()
  const matchId = useContext(matchContext)
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

  if (routeId === rootRouteId) {
    return <Suspense fallback={pendingElement}>{nextMatch}</Suspense>
  }

  return nextMatch
}
