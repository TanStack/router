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
import {
  nonRouteComponentContext,
  wrapInNonRouteComponentContext,
} from './nonRouteComponentContext'
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
  if (!PendingComponent) {
    return null
  }

  const pendingElement = <PendingComponent />
  return process.env.NODE_ENV !== 'production'
    ? wrapInNonRouteComponentContext(pendingElement, 'pendingComponent')
    : pendingElement
}

type OutletMatchSelection = [
  parentGlobalNotFound: boolean,
  parentNotFoundError: unknown,
]

const outletMatchSelectionEqual = (
  a: OutletMatchSelection,
  b: OutletMatchSelection,
) => a[0] === b[0] && a[1] === b[1]

const canWrapInSuspense = (
  router: ReturnType<typeof useRouter>,
  route: AnyRoute,
  ssr: AnyRouteMatch['ssr'],
) =>
  !route.isRoot ||
  (route.options as RootRouteOptions).shellComponent ||
  route.options.wrapInSuspense ||
  ssr === false ||
  ssr === 'data-only' ||
  !((isServer ?? router.isServer) || router.ssr)

export const Match = React.memo(function MatchImpl({
  routeId,
}: {
  routeId: string
}) {
  const router = useRouter()
  const match = router.stores.byRoute.get(routeId)!.get()!
  const route: AnyRoute = router.routesById[routeId]
  const ShellComponent = route.isRoot
    ? ((route.options as RootRouteOptions).shellComponent ?? SafeFragment)
    : SafeFragment
  // Keep the reactive match subtree out of dehydrated client-only boundaries.
  const inner = <MatchInner routeId={routeId} />
  return (
    <ShellComponent>
      <matchContext.Provider value={routeId}>
        {match.ssr === false || match.ssr === 'data-only' ? (
          <ClientOnly
            fallback={renderMatchBoundaries(
              router,
              route,
              match,
              renderPending(router, route),
            )}
          >
            {inner}
          </ClientOnly>
        ) : (
          inner
        )}
      </matchContext.Provider>
      {(isServer ?? router.isServer) &&
      route.parentRoute?.id === rootRouteId &&
      router.options.scrollRestoration ? (
        <ScrollRestoration />
      ) : null}
    </ShellComponent>
  )
})

function renderMatchBoundaries(
  router: ReturnType<typeof useRouter>,
  route: AnyRoute,
  match: AnyRouteMatch,
  children: React.ReactNode,
) {
  const routeErrorComponent =
    route.options.errorComponent ?? router.options.defaultErrorComponent
  const onCatch = route.options.onCatch ?? router.options.defaultOnCatch
  const routeNotFoundComponent = route.isRoot
    ? (route.options.notFoundComponent ??
      router.options.notFoundRoute?.options.component)
    : route.options.notFoundComponent
  const ResolvedCatchBoundary = routeErrorComponent
    ? CatchBoundary
    : SafeFragment
  const ResolvedNotFoundBoundary = routeNotFoundComponent
    ? CatchNotFound
    : SafeFragment

  return (
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
        onCatch?.(error, errorInfo)
      }}
    >
      <ResolvedNotFoundBoundary
        fallback={(error) => {
          error.routeId ??= match.routeId

          if (error.routeId !== match.routeId) {
            throw error
          }

          const notFoundElement = React.createElement(
            routeNotFoundComponent!,
            error as any,
          )
          return process.env.NODE_ENV !== 'production'
            ? wrapInNonRouteComponentContext(
                notFoundElement,
                'notFoundComponent',
              )
            : notFoundElement
        }}
      >
        {children}
      </ResolvedNotFoundBoundary>
    </ResolvedCatchBoundary>
  )
}

export function MatchInner({ routeId }: { routeId: string }): any {
  const router = useRouter()
  let match: AnyRouteMatch

  if (isServer ?? router.isServer) {
    match = router.stores.byRoute.get(routeId)!.get()!
  } else {
    const matchStore = router.stores.getMatchStore(routeId)
    // eslint-disable-next-line react-hooks/rules-of-hooks
    match = useStore(matchStore, (value) => value!)
  }

  const route = router.routesById[routeId] as AnyRoute
  const pendingElement = renderPending(router, route)
  // A root component may render the document itself. Only place its Suspense
  // boundary in pure CSR, inside an explicit shell, or when explicitly opted in.
  const ResolvedSuspenseBoundary =
    canWrapInSuspense(router, route, match.ssr) &&
    (route.options.wrapInSuspense ??
      pendingElement ??
      ((route.options.errorComponent as any)?.preload ||
        match.ssr === false ||
        match.ssr === 'data-only'))
      ? React.Suspense
      : SafeFragment

  return (
    <ResolvedSuspenseBoundary fallback={pendingElement}>
      {renderMatchBoundaries(
        router,
        route,
        match,
        <MatchView router={router} route={route} match={match} />,
      )}
    </ResolvedSuspenseBoundary>
  )
}

function MatchView({
  router,
  route,
  match,
}: {
  router: ReturnType<typeof useRouter>
  route: AnyRoute
  match: AnyRouteMatch
}): any {
  const key = React.useMemo(() => {
    const remountFn =
      route.options.remountDeps ?? router.options.defaultRemountDeps
    const remountDeps = remountFn?.({
      routeId: route.id,
      loaderDeps: match.loaderDeps,
      params: match._strictParams,
      search: match._strictSearch,
    })
    return remountDeps ? JSON.stringify(remountDeps) : undefined
  }, [
    route.id,
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
    if (router.ssr && !canWrapInSuspense(router, route, match.ssr)) {
      // Replacing an SSR document root with pending UI would remove <html>.
      // Hydrated matches retain their prior data, so keep rendering it.
      return out
    }
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
      const errorElement = (
        <RouteErrorComponent
          error={match.error as any}
          reset={undefined as any}
          info={{
            componentStack: '',
          }}
        />
      )
      return process.env.NODE_ENV !== 'production'
        ? wrapInNonRouteComponentContext(errorElement, 'errorComponent')
        : errorElement
    }
    throw match.error
  }

  return out
}

/**
 * Render the next child match in the route tree. Typically used inside
 * a route component to render nested routes.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/outletComponent
 */
export const Outlet = React.memo(function OutletImpl() {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const nonRouteComponent = React.useContext(nonRouteComponentContext!)
    if (nonRouteComponent) {
      console.warn(
        `Warning: An <Outlet /> was rendered inside a ${nonRouteComponent}. <Outlet /> should only be rendered inside a route component.`,
      )
    }
  }

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
