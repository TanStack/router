import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  createControlledPromise,
  getLocationChangeInfo,
  isNotFound,
  isRedirect,
  rootRouteId,
} from '@tanstack/router-core'
import { Dynamic } from 'solid-js/web'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { matchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import { useMatchContextState } from './Matches'
import type { AnyRoute, RootRouteOptions } from '@tanstack/router-core'

export const Match = (props: { matchId: string }) => {
  const router = useRouter()

  // Query match data reactively using useRouterState
  // This ensures we get updates when the match changes
  const matchState = useRouterState({
    select: (s) => {
      // Check current matches first
      let match = s.matches.find((d) => d.id === props.matchId)

      // During async transitions, old components may re-render after their match
      // has been moved to cachedMatches. Check there as a fallback.
      if (!match) {
        match = s.cachedMatches.find((d) => d.id === props.matchId)
      }

      // Return undefined gracefully if match doesn't exist (component is unmounting)
      if (!match) {
        return undefined
      }

      return {
        routeId: match.routeId,
        ssr: match.ssr,
        _displayPending: match._displayPending,
      }
    },
  })

  // Early return if no match data
  if (!matchState()) {
    return null
  }

  const route: () => AnyRoute = () => router.routesById[matchState()!.routeId]

  const PendingComponent = () =>
    route().options.pendingComponent ?? router.options.defaultPendingComponent

  const routeErrorComponent = () =>
    route().options.errorComponent ?? router.options.defaultErrorComponent

  const routeOnCatch = () =>
    route().options.onCatch ?? router.options.defaultOnCatch

  const routeNotFoundComponent = () =>
    route().isRoot
      ? // If it's the root route, use the globalNotFound option, with fallback to the notFoundRoute's component
        (route().options.notFoundComponent ??
        router.options.notFoundRoute?.options.component)
      : route().options.notFoundComponent

  const resolvedNoSsr =
    matchState()!.ssr === false || matchState()!.ssr === 'data-only'

  const ResolvedSuspenseBoundary = () =>
    // If we're on the root route, allow forcefully wrapping in suspense
    (!route().isRoot ||
      route().options.wrapInSuspense ||
      resolvedNoSsr ||
      matchState()!._displayPending ||
      PendingComponent()) &&
    (route().options.wrapInSuspense ??
      PendingComponent() ??
      ((route().options.errorComponent as any)?.preload || resolvedNoSsr))
      ? Solid.Suspense
      : SafeFragment

  const ResolvedCatchBoundary = () =>
    routeErrorComponent() ? CatchBoundary : SafeFragment

  const ResolvedNotFoundBoundary = () =>
    routeNotFoundComponent() ? CatchNotFound : SafeFragment

  const resetKey = useRouterState({
    select: (s) => s.loadedAt,
  })

  const parentRouteId = useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((d) => d.id === props.matchId)
      return s.matches[index - 1]?.routeId as string
    },
  })

  const ShellComponent = route().isRoot
    ? ((route().options as RootRouteOptions).shellComponent ?? SafeFragment)
    : SafeFragment

  return (
    <ShellComponent>
      <matchContext.Provider value={() => props.matchId}>
        <Dynamic
          component={ResolvedSuspenseBoundary()}
          fallback={
            // Don't show fallback on server when using no-ssr mode to avoid hydration mismatch
            router.isServer || resolvedNoSsr ? undefined : (
              <Dynamic component={PendingComponent()} />
            )
          }
        >
          <Dynamic
            component={ResolvedCatchBoundary()}
            getResetKey={() => resetKey()}
            errorComponent={routeErrorComponent() || ErrorComponent}
            onCatch={(error: Error) => {
              // Forward not found errors (we don't want to show the error component for these)
              if (isNotFound(error)) throw error
              warning(false, `Error in route match: ${props.matchId}`)
              routeOnCatch()?.(error)
            }}
          >
            <Dynamic
              component={ResolvedNotFoundBoundary()}
              fallback={(error: any) => {
                // If the current not found handler doesn't exist or it has a
                // route ID which doesn't match the current route, rethrow the error
                if (
                  !routeNotFoundComponent() ||
                  (error.routeId && error.routeId !== matchState()!.routeId) ||
                  (!error.routeId && !route().isRoot)
                )
                  throw error

                return (
                  <Dynamic component={routeNotFoundComponent()} {...error} />
                )
              }}
            >
              <Solid.Switch>
                <Solid.Match when={resolvedNoSsr}>
                  <Solid.Show
                    when={!router.isServer}
                    fallback={<Dynamic component={PendingComponent()} />}
                  >
                    <MatchInner matchId={props.matchId} />
                  </Solid.Show>
                </Solid.Match>
                <Solid.Match when={!resolvedNoSsr}>
                  <MatchInner matchId={props.matchId} />
                </Solid.Match>
              </Solid.Switch>
            </Dynamic>
          </Dynamic>
        </Dynamic>
      </matchContext.Provider>

      {parentRouteId() === rootRouteId ? (
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

  const location = useRouterState({
    select: (s) => {
      return s.resolvedLocation?.state.__TSR_key
    },
  })
  Solid.createEffect(
    Solid.on([location], () => {
      router.emit({
        type: 'onRendered',
        ...getLocationChangeInfo(router.state),
      })
    }),
  )
  return null
}

export const MatchInner = (props: { matchId: string }): any => {
  const router = useRouter()

  const matchState = useRouterState({
    select: (s) => {
      // Check current matches first
      let match = s.matches.find((d) => d.id === props.matchId)

      // During async transitions, old components may re-render after their match
      // has been moved to cachedMatches. Check there as a fallback.
      if (!match) {
        match = s.cachedMatches.find((d) => d.id === props.matchId)
      }

      if (!match) {
        return undefined
      }

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
  })

  if (!matchState()) {
    return null
  }

  const route = () => router.routesById[matchState()!.routeId]!

  const match = () => matchState()!.match

  const componentKey = () => matchState()!.key ?? matchState()!.match.id

  const out = () => {
    const Comp = route().options.component ?? router.options.defaultComponent
    if (Comp) {
      return <Comp />
    }
    return <Outlet />
  }

  const keyedOut = () => (
    <Solid.Show when={componentKey()} keyed>
      {(_key) => out()}
    </Solid.Show>
  )

  return (
    <Solid.Switch>
      <Solid.Match when={match()._displayPending}>
        {(_) => {
          const [displayPendingResult] = Solid.createResource(
            () =>
              router.getMatch(match().id)?._nonReactive.displayPendingPromise,
          )

          return <>{displayPendingResult()}</>
        }}
      </Solid.Match>
      <Solid.Match when={match()._forcePending}>
        {(_) => {
          const [minPendingResult] = Solid.createResource(
            () => router.getMatch(match().id)?._nonReactive.minPendingPromise,
          )

          return <>{minPendingResult()}</>
        }}
      </Solid.Match>
      <Solid.Match when={match().status === 'pending'}>
        {(_) => {
          const pendingMinMs =
            route().options.pendingMinMs ?? router.options.defaultPendingMinMs

          if (pendingMinMs) {
            const routerMatch = router.getMatch(match().id)
            if (routerMatch && !routerMatch._nonReactive.minPendingPromise) {
              // Create a promise that will resolve after the minPendingMs
              if (!router.isServer) {
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

          const [loaderResult] = Solid.createResource(async () => {
            await new Promise((r) => setTimeout(r, 0))
            return router.getMatch(match().id)?._nonReactive.loadPromise
          })

          return <>{loaderResult()}</>
        }}
      </Solid.Match>
      <Solid.Match when={match().status === 'notFound'}>
        {(_) => {
          invariant(isNotFound(match().error), 'Expected a notFound error')

          return renderRouteNotFound(router, route(), match().error)
        }}
      </Solid.Match>
      <Solid.Match when={match().status === 'redirected'}>
        {(_) => {
          invariant(isRedirect(match().error), 'Expected a redirect error')

          const [loaderResult] = Solid.createResource(async () => {
            await new Promise((r) => setTimeout(r, 0))
            return router.getMatch(match().id)?._nonReactive.loadPromise
          })

          return <>{loaderResult()}</>
        }}
      </Solid.Match>
      <Solid.Match when={match().status === 'error'}>
        {(_) => {
          if (router.isServer) {
            const RouteErrorComponent =
              (route().options.errorComponent ??
                router.options.defaultErrorComponent) ||
              ErrorComponent

            return (
              <RouteErrorComponent
                error={match().error}
                info={{
                  componentStack: '',
                }}
              />
            )
          }

          throw match().error
        }}
      </Solid.Match>
      <Solid.Match when={match().status === 'success'}>
        {keyedOut()}
      </Solid.Match>
    </Solid.Switch>
  )
}

export const Outlet = () => {
  const router = useRouter()
  const matchId = Solid.useContext(matchContext)

  // Use the stable match context for the outlet function
  const matchContextState = useMatchContextState()

  const routeId = useRouterState({
    select: (s) => {
      // Check matches first, then cachedMatches
      let match = s.matches.find((d) => d.id === matchId())
      if (!match) {
        match = s.cachedMatches.find((d) => d.id === matchId())
      }
      return match?.routeId as string
    },
  })

  const route = () => router.routesById[routeId()]!

  const parentGlobalNotFound = useRouterState({
    select: (s) => {
      // Check matches first, then cachedMatches
      let parentMatch = s.matches.find((d) => d.id === matchId())
      if (!parentMatch) {
        parentMatch = s.cachedMatches.find((d) => d.id === matchId())
      }

      // Return undefined gracefully if not found
      if (!parentMatch) {
        return undefined
      }

      return parentMatch.globalNotFound
    },
  })

  // Use the outlet function from the context instead of manually rendering Match
  const outlet = Solid.createMemo(() => {
    const ctx = matchContextState?.()
    return ctx?.outlet
  })

  return (
    <>
      <Solid.Show when={parentGlobalNotFound()}>
        {renderRouteNotFound(router, route(), undefined)}
      </Solid.Show>
      <Solid.Show when={!parentGlobalNotFound() && outlet()}>
        {(outletFn) => <>{outletFn()()}</>}
      </Solid.Show>
    </>
  )
}
