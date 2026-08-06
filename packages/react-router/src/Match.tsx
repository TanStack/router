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
import type { ErrorRouteComponent } from './route'
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

type MatchSelection = [
  matchId: string | undefined,
  ssr: boolean | 'data-only' | undefined,
  status: AnyRouteMatch['status'] | undefined,
  error: unknown,
  remountKey: string | undefined,
  lazy: LazyRouteState,
]

// `_lazy` is marked `@internal`, so it is stripped from the published
// declarations router-core's consumers compile against.
type LazyRouteState = Promise<void> | true | undefined

const matchSelectionEqual = (a: MatchSelection, b: MatchSelection) =>
  a[0] === b[0] &&
  a[1] === b[1] &&
  a[2] === b[2] &&
  a[3] === b[3] &&
  a[4] === b[4] &&
  a[5] === b[5]

const emptyMatchSelection: MatchSelection = [
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
]

// `buildMatches` re-mints every staying match on every navigation (a fresh
// object with a fresh `_strictSearch`, `context` and `abortController`, and an
// updated `cause`), so a match store always republishes with a new identity.
// Selecting only the fields this subtree renders lets a staying route bail out.
// `loaderDeps`/`_strictParams`/`_strictSearch` reach the output solely through
// the remount key, so the key is computed here and compared as a string.
// `route._lazy` is selected too: a lazy route's options are assigned onto the
// route in place, and a re-offered pending match is the only signal that the
// components this subtree renders have just been replaced.
function selectMatchFields(
  router: ReturnType<typeof useRouter>,
  routeId: string,
  match: AnyRouteMatch | undefined,
): MatchSelection {
  if (!match) return emptyMatchSelection

  const route = router.routesById[routeId] as AnyRoute
  const remountFn =
    route.options.remountDeps ?? router.options.defaultRemountDeps
  const remountDeps = remountFn?.({
    routeId,
    loaderDeps: match.loaderDeps,
    params: match._strictParams,
    search: match._strictSearch,
  })

  return [
    match.id,
    match.ssr,
    match.status,
    match.error,
    remountDeps ? JSON.stringify(remountDeps) : undefined,
    (route as { _lazy?: LazyRouteState })._lazy,
  ]
}

export const Match = React.memo(function MatchImpl({
  routeId,
}: {
  routeId: string
}) {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    const match = router.stores.byRoute.get(routeId)!.get()!
    return (
      <MatchView
        router={router}
        routeId={routeId}
        selection={selectMatchFields(router, routeId, match)}
      />
    )
  }

  const matchStore = router.stores.getMatchStore(routeId)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const selection = useStore(
    matchStore,
    (match) => selectMatchFields(router, routeId, match),
    matchSelectionEqual,
  )
  return <MatchView router={router} routeId={routeId} selection={selection} />
})

// `CatchBoundary` resets its error whenever `getResetKey()` changes, and the
// match identity is what changes per navigation. Observing it here rather than
// in `Match` keeps that per-navigation update off every mounted route: only
// routes that actually have an `errorComponent` pay for it, and because
// `props.children` is the element `MatchView` already created, the subtree
// below bails out.
function ResettableCatchBoundary({
  routeId,
  ...props
}: {
  routeId: string
  children: React.ReactNode
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: Error, errorInfo: React.ErrorInfo) => void
}) {
  const router = useRouter()
  const resetKey =
    (isServer ?? router.isServer)
      ? router.stores.byRoute.get(routeId)!.get()
      : // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
        useStore(router.stores.getMatchStore(routeId), (match) => match)

  return <CatchBoundary getResetKey={() => resetKey} {...props} />
}

function MatchView({
  router,
  routeId,
  selection,
}: {
  router: ReturnType<typeof useRouter>
  routeId: string
  selection: MatchSelection
}) {
  const [matchId, ssr, status, error, remountKey] = selection
  const route: AnyRoute = router.routesById[routeId]

  const pendingElement = renderPending(router, route)

  const routeErrorComponent =
    route.options.errorComponent ?? router.options.defaultErrorComponent

  const routeOnCatch = route.options.onCatch ?? router.options.defaultOnCatch

  const routeNotFoundComponent = route.isRoot
    ? // If it's the root route, use the _notFound option, with fallback to the notFoundRoute's component
      (route.options.notFoundComponent ??
      router.options.notFoundRoute?.options.component)
    : route.options.notFoundComponent

  const resolvedNoSsr = ssr === false || ssr === 'data-only'
  const ResolvedSuspenseBoundary =
    (route.options.wrapInSuspense ??
    pendingElement ??
    ((route.options.errorComponent as any)?.preload || resolvedNoSsr))
      ? React.Suspense
      : SafeFragment

  const ResolvedCatchBoundary = routeErrorComponent
    ? ResettableCatchBoundary
    : SafeFragment

  const ResolvedNotFoundBoundary = routeNotFoundComponent
    ? CatchNotFound
    : SafeFragment

  const ShellComponent = route.isRoot
    ? ((route.options as RootRouteOptions).shellComponent ?? SafeFragment)
    : SafeFragment
  return (
    <ShellComponent>
      <matchContext.Provider value={routeId}>
        <ResolvedSuspenseBoundary fallback={pendingElement}>
          <ResolvedCatchBoundary
            routeId={routeId}
            errorComponent={routeErrorComponent as any}
            onCatch={(error, errorInfo) => {
              // Forward not found errors (we don't want to show the error component for these)
              if (isNotFound(error)) {
                error.routeId ??= routeId
                throw error
              }
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`Warning: Error in route match: ${matchId}`)
              }
              routeOnCatch?.(error, errorInfo)
            }}
          >
            <ResolvedNotFoundBoundary
              fallback={(error) => {
                error.routeId ??= routeId

                if (error.routeId !== routeId) {
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
                  <MatchInner
                    routeId={routeId}
                    status={status}
                    error={error}
                    remountKey={remountKey}
                  />
                </ClientOnly>
              ) : (
                <MatchInner
                  routeId={routeId}
                  status={status}
                  error={error}
                  remountKey={remountKey}
                />
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
  routeId,
  status,
  error,
  remountKey,
}: {
  routeId: string
  status: AnyRouteMatch['status'] | undefined
  error: unknown
  remountKey: string | undefined
}): any {
  const router = useRouter()
  const route = router.routesById[routeId] as AnyRoute
  const out = React.useMemo(() => {
    const Comp = route.options.component ?? router.options.defaultComponent
    return Comp ? <Comp key={remountKey} /> : <Outlet />
  }, [remountKey, route.options.component, router.options.defaultComponent])

  if (status === 'pending') {
    if (router._tx) {
      throw router._tx[5]
    }
    return renderPending(router, route)
  }

  if (status === 'notFound') {
    return renderRouteNotFound(router, route, error)
  }

  if (status === 'error') {
    if (isServer ?? router.isServer) {
      const RouteErrorComponent =
        (route.options.errorComponent ??
          router.options.defaultErrorComponent) ||
        ErrorComponent
      return (
        <RouteErrorComponent
          error={error as any}
          reset={undefined as any}
          info={{
            componentStack: '',
          }}
        />
      )
    }
    throw error
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
