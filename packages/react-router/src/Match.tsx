'use client'

import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { isNotFound, rootRouteId } from '@tanstack/router-core'
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
  AnyRouteMatch,
  RootRouteOptions,
} from '@tanstack/router-core'

export function renderPending(
  router: ReturnType<typeof useRouter>,
  route?: AnyRoute,
) {
  const PendingComponent =
    route?.options.pendingComponent ?? router.options.defaultPendingComponent
  return PendingComponent ? <PendingComponent /> : null
}

type OutletMatchSelection = [
  parentGlobalNotFound: boolean,
  parentNotFoundError: unknown,
]

const outletMatchSelectionEqual = (
  a: OutletMatchSelection,
  b: OutletMatchSelection,
) => a[0] === b[0] && a[1] === b[1]

export const Match = React.memo(function MatchImpl({
  routeId,
}: {
  routeId: string
}) {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    const match = router.stores.byRoute.get(routeId)!.get()!
    return <MatchView router={router} match={match} />
  }

  const matchStore = router.stores.getMatchStore(routeId)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const match = useStore(matchStore, (value) => value)
  return <MatchView router={router} match={match!} />
})

function MatchView({
  router,
  match,
}: {
  router: ReturnType<typeof useRouter>
  match: AnyRouteMatch
}) {
  const route: AnyRoute = router.routesById[match.routeId]

  const pendingElement = renderPending(router, route)

  const routeErrorComponent =
    route.options.errorComponent ?? router.options.defaultErrorComponent

  const routeOnCatch = route.options.onCatch ?? router.options.defaultOnCatch

  const routeNotFoundComponent = route.isRoot
    ? // If it's the root route, use the _notFound option, with fallback to the notFoundRoute's component
      (route.options.notFoundComponent ??
      router.options.notFoundRoute?.options.component)
    : route.options.notFoundComponent

  const resolvedNoSsr = match.ssr === false || match.ssr === 'data-only'
  const ResolvedSuspenseBoundary =
    (route.options.wrapInSuspense ??
    pendingElement ??
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
      <matchContext.Provider value={match.routeId}>
        <ResolvedSuspenseBoundary fallback={pendingElement}>
          <ResolvedCatchBoundary
            getResetKey={() => match}
            errorComponent={routeErrorComponent as any}
            onCatch={(error, errorInfo) => {
              // Forward not found errors (we don't want to show the error component for these)
              if (isNotFound(error)) {
                error.routeId ??= match.routeId
                throw error
              }
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`Warning: Error in route match: ${match.id}`)
              }
              routeOnCatch?.(error, errorInfo)
            }}
          >
            <ResolvedNotFoundBoundary
              fallback={(error) => {
                error.routeId ??= match.routeId

                if (error.routeId !== match.routeId) {
                  throw error
                }

                return React.createElement(
                  routeNotFoundComponent!,
                  error as any,
                )
              }}
            >
              {resolvedNoSsr ? (
                <ClientOnly fallback={pendingElement}>
                  <MatchInner match={match} />
                </ClientOnly>
              ) : (
                <MatchInner match={match} />
              )}
            </ResolvedNotFoundBoundary>
          </ResolvedCatchBoundary>
        </ResolvedSuspenseBoundary>
      </matchContext.Provider>
      {(isServer ?? router.isServer) &&
      route.parentRoute?.id === rootRouteId &&
      router.options.scrollRestoration ? (
        <ScrollRestoration />
      ) : null}
    </ShellComponent>
  )
}

export const MatchInner = React.memo(function MatchInnerImpl({
  match,
}: {
  match: AnyRouteMatch
}): any {
  const router = useRouter()
  const routeId = match.routeId
  const route = router.routesById[routeId] as AnyRoute
  const key = React.useMemo(() => {
    const remountFn =
      route.options.remountDeps ?? router.options.defaultRemountDeps
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
    route.options.remountDeps,
    router.options.defaultRemountDeps,
  ])
  const out = React.useMemo(() => {
    const Comp = route.options.component ?? router.options.defaultComponent
    return Comp ? <Comp key={key} /> : <Outlet />
  }, [key, route.options.component, router.options.defaultComponent])

  if (match.status === 'pending') {
    if (router._tx) {
      throw router._tx[5]
    }
    return renderPending(router, route)
  }

  if (match.status === 'notFound') {
    return renderRouteNotFound(router, route, match.error)
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
})

/**
 * Render the next child match in the route tree. Typically used inside
 * a route component to render nested routes.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/outletComponent
 */
export const Outlet = React.memo(function OutletImpl() {
  const router = useRouter()
  const routeId = React.useContext(matchContext)!

  let parentGlobalNotFound: boolean
  let parentNotFoundError: unknown
  let childRouteId: string | undefined

  if (isServer ?? router.isServer) {
    const matches = router.stores.matches.get()
    const parentIndex = matches.findIndex((match) => match.routeId === routeId)
    const parentMatch = matches[parentIndex]!
    parentGlobalNotFound = !!parentMatch._notFound
    parentNotFoundError = parentMatch.error
    childRouteId = matches[parentIndex + 1]?.routeId
  } else {
    const parentMatchStore = router.stores.getMatchStore(routeId)

    // eslint-disable-next-line react-hooks/rules-of-hooks
    ;[parentGlobalNotFound, parentNotFoundError] = useStore(
      parentMatchStore,
      (match): OutletMatchSelection => [!!match!._notFound, match!.error],
      outletMatchSelectionEqual,
    )

    // eslint-disable-next-line react-hooks/rules-of-hooks
    childRouteId = useStore(router.stores.ids, (ids) => {
      return ids[ids.indexOf(routeId) + 1]
    })
  }

  if (parentGlobalNotFound) {
    return renderRouteNotFound(
      router,
      router.routesById[routeId],
      parentNotFoundError,
    )
  }

  if (!childRouteId) {
    return null
  }

  const nextMatch = <Match routeId={childRouteId} />

  if (routeId === rootRouteId) {
    return (
      <React.Suspense fallback={renderPending(router)}>
        {nextMatch}
      </React.Suspense>
    )
  }

  return nextMatch
})
