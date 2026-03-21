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
import { isServer } from '@tanstack/router-core/isServer'
import { Dynamic } from '@solidjs/web'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { nearestMatchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import type { AnyRoute, RootRouteOptions } from '@tanstack/router-core'

const NearestMatchContext = nearestMatchContext as unknown as Solid.Component<{
  value: any
  children?: any
}>

export const Match = (props: { matchId: string }) => {
  const router = useRouter()

  const match = Solid.createMemo(() => {
    const id = props.matchId
    if (!id) return undefined
    return router.stores.activeMatchStoresById.get(id)?.state
  })

  const rawMatchState = Solid.createMemo(() => {
    const currentMatch = match()
    if (!currentMatch) {
      return null
    }

    const routeId = currentMatch.routeId as string
    const parentRouteId = (router.routesById[routeId] as AnyRoute)?.parentRoute
      ?.id

    return {
      matchId: currentMatch.id,
      routeId,
      ssr: currentMatch.ssr,
      _displayPending: currentMatch._displayPending,
      parentRouteId: parentRouteId as string | undefined,
    }
  })

  const hasPendingMatch = Solid.createMemo(() => {
    const currentRouteId = rawMatchState()?.routeId
    return currentRouteId
      ? Boolean(router.stores.pendingRouteIds.state[currentRouteId])
      : false
  })
  const nearestMatch = {
    matchId: () => rawMatchState()?.matchId,
    routeId: () => rawMatchState()?.routeId,
    match,
    hasPending: hasPendingMatch,
  }

  return (
    <Solid.Show when={rawMatchState()}>
      {(currentMatchState) => {
        const route = Solid.createMemo(
          () => router.routesById[currentMatchState().routeId] as AnyRoute,
        )

        const resolvePendingComponent = Solid.createMemo(
          () =>
            route().options.pendingComponent ??
            router.options.defaultPendingComponent,
        )

        const routeErrorComponent = Solid.createMemo(
          () =>
            route().options.errorComponent ??
            router.options.defaultErrorComponent,
        )

        const routeOnCatch = Solid.createMemo(
          () => route().options.onCatch ?? router.options.defaultOnCatch,
        )

        const routeNotFoundComponent = Solid.createMemo(() =>
          route().isRoot
            ? // If it's the root route, use the globalNotFound option, with fallback to the notFoundRoute's component
              (route().options.notFoundComponent ??
              router.options.notFoundRoute?.options.component)
            : route().options.notFoundComponent,
        )

        const resolvedNoSsr = Solid.createMemo(
          () =>
            currentMatchState().ssr === false ||
            currentMatchState().ssr === 'data-only',
        )

        const ResolvedSuspenseBoundary = Solid.createMemo(() =>
          resolvedNoSsr() ? SafeFragment : Solid.Loading,
        )

        const ResolvedCatchBoundary = Solid.createMemo(() =>
          routeErrorComponent() ? CatchBoundary : SafeFragment,
        )

        const ResolvedNotFoundBoundary = Solid.createMemo(() =>
          routeNotFoundComponent() ? CatchNotFound : SafeFragment,
        )

        const ShellComponent = Solid.createMemo(() =>
          route().isRoot
            ? ((route().options as RootRouteOptions).shellComponent ??
              SafeFragment)
            : SafeFragment,
        )

        return (
          <Dynamic component={ShellComponent()}>
            <NearestMatchContext value={nearestMatch}>
              <Dynamic
                component={ResolvedSuspenseBoundary()}
                fallback={
                  // Don't show fallback on server when using no-ssr mode to avoid hydration mismatch
                  (isServer ?? router.isServer) &&
                  resolvedNoSsr() ? undefined : (
                    <Dynamic component={resolvePendingComponent()} />
                  )
                }
              >
                <Dynamic
                  component={ResolvedCatchBoundary()}
                  getResetKey={() => router.stores.loadedAt.state}
                  errorComponent={routeErrorComponent() || ErrorComponent}
                  onCatch={(error: Error) => {
                    // Forward not found errors (we don't want to show the error component for these)
                    if (isNotFound(error)) throw error
                    warning(
                      false,
                      `Error in route match: ${currentMatchState().routeId}`,
                    )
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
                        (error.routeId &&
                          error.routeId !== currentMatchState().routeId) ||
                        (!error.routeId && !route().isRoot)
                      )
                        throw error

                      return (
                        <Dynamic
                          component={routeNotFoundComponent()}
                          {...error}
                        />
                      )
                    }}
                  >
                    <Solid.Switch>
                      <Solid.Match when={resolvedNoSsr()}>
                        <Solid.Show
                          when={!(isServer ?? router.isServer)}
                          fallback={
                            <Dynamic component={resolvePendingComponent()} />
                          }
                        >
                          <MatchInner />
                        </Solid.Show>
                      </Solid.Match>
                      <Solid.Match when={!resolvedNoSsr()}>
                        <MatchInner />
                      </Solid.Match>
                    </Solid.Switch>
                  </Dynamic>
                </Dynamic>
              </Dynamic>
            </NearestMatchContext>

            {currentMatchState().parentRouteId === rootRouteId ? (
              <>
                <OnRendered />
                <ScrollRestoration />
              </>
            ) : null}
          </Dynamic>
        )
      }}
    </Solid.Show>
  )
}

// On Rendered can't happen above the root layout because it actually
// renders a dummy dom element to track the rendered state of the app.
// We render a script tag with a key that changes based on the current
// location state.__TSR_key. Also, because it's below the root layout, it
// allows us to fire onRendered events even after a hydration mismatch
// error that occurred above the root layout (like bad head/link tags,
// which is common).
//
// In Solid, createEffect(source, fn) fires on initial mount as well as on
// reactive changes. OnRendered can also remount when the first child route
// changes (e.g. navigating from / to /posts). We deduplicate by tracking
// the last emitted resolvedLocation key per router so each unique resolved
// location only triggers one onRendered event regardless of remounts.
const lastOnRenderedKey = new WeakMap<object, string>()

function OnRendered() {
  const router = useRouter()

  const location = Solid.createMemo(
    () => router.stores.resolvedLocation.state?.state.__TSR_key,
  )
  const locationState = Solid.createMemo(() => router.stores.location.state)
  const resolvedLocationState = Solid.createMemo(
    () => router.stores.resolvedLocation.state,
  )
  Solid.createEffect(
    () => [location(), locationState(), resolvedLocationState()] as const,
    ([location, currentLocationState, currentResolvedLocationState]) => {
      if (!location) return
      if (lastOnRenderedKey.get(router) === location) return
      lastOnRenderedKey.set(router, location)
      router.emit({
        type: 'onRendered',
        ...getLocationChangeInfo(
          currentLocationState,
          currentResolvedLocationState,
        ),
      })
    },
  )
  return null
}

export const MatchInner = (): any => {
  const router = useRouter()
  const match = Solid.useContext(nearestMatchContext).match

  const rawMatchState = Solid.createMemo(() => {
    const currentMatch = match()
    if (!currentMatch) {
      return null
    }

    const routeId = currentMatch.routeId as string

    const remountFn =
      (router.routesById[routeId] as AnyRoute).options.remountDeps ??
      router.options.defaultRemountDeps
    const remountDeps = remountFn?.({
      routeId,
      loaderDeps: currentMatch.loaderDeps,
      params: currentMatch._strictParams,
      search: currentMatch._strictSearch,
    })
    const key = remountDeps ? JSON.stringify(remountDeps) : undefined

    return {
      key,
      routeId,
      match: {
        id: currentMatch.id,
        status: currentMatch.status,
        error: currentMatch.error,
        _forcePending: currentMatch._forcePending ?? false,
        _displayPending: currentMatch._displayPending ?? false,
      },
    }
  })

  return (
    <Solid.Show when={rawMatchState()}>
      {(currentMatchState) => {
        const route = Solid.createMemo(
          () => router.routesById[currentMatchState().routeId]!,
        )

        const currentMatch = Solid.createMemo(() => currentMatchState().match)

        const componentKey = Solid.createMemo(
          () => currentMatchState().key ?? currentMatchState().match.id,
        )

        const Comp = Solid.createMemo(
          () => route().options.component ?? router.options.defaultComponent,
        )

        const OutComponent = Solid.createMemo(() => {
          const C = Comp()
          return C || Outlet
        })

        const RenderOut = () => <Dynamic component={OutComponent()} />

        const keyedOut = () => (
          <Solid.Show when={componentKey()} keyed>
            {(_key) => <RenderOut />}
          </Solid.Show>
        )

        return (
          <Solid.Switch>
            <Solid.Match when={currentMatch()._displayPending}>
              {(_) => {
                const displayPendingResult = Solid.createMemo(
                  () =>
                    router.getMatch(currentMatch().id)?._nonReactive
                      .displayPendingPromise,
                )

                return <>{displayPendingResult()}</>
              }}
            </Solid.Match>
            <Solid.Match when={currentMatch()._forcePending}>
              {(_) => {
                const minPendingResult = Solid.createMemo(
                  () =>
                    router.getMatch(currentMatch().id)?._nonReactive
                      .minPendingPromise,
                )

                return <>{minPendingResult()}</>
              }}
            </Solid.Match>
            <Solid.Match when={currentMatch().status === 'pending'}>
              {(_) => {
                const pendingMinMs = Solid.untrack(
                  () =>
                    route().options.pendingMinMs ??
                    router.options.defaultPendingMinMs,
                )

                if (pendingMinMs) {
                  const routerMatch = Solid.untrack(() =>
                    router.getMatch(currentMatch().id),
                  )
                  if (
                    routerMatch &&
                    !routerMatch._nonReactive.minPendingPromise
                  ) {
                    // Create a promise that will resolve after the minPendingMs
                    if (!(isServer ?? router.isServer)) {
                      const minPendingPromise = createControlledPromise<void>()

                      routerMatch._nonReactive.minPendingPromise =
                        minPendingPromise

                      setTimeout(() => {
                        minPendingPromise.resolve()
                        // We've handled the minPendingPromise, so we can delete it
                        routerMatch._nonReactive.minPendingPromise = undefined
                      }, pendingMinMs)
                    }
                  }
                }

                const loaderResult = Solid.createMemo(async () => {
                  await new Promise((r) => setTimeout(r, 0))
                  return router.getMatch(currentMatch().id)?._nonReactive
                    .loadPromise
                })

                const FallbackComponent = Solid.untrack(
                  () =>
                    route().options.pendingComponent ??
                    router.options.defaultPendingComponent,
                )

                return (
                  <>
                    {FallbackComponent && pendingMinMs > 0 ? (
                      <Dynamic component={FallbackComponent} />
                    ) : null}
                    {loaderResult()}
                  </>
                )
              }}
            </Solid.Match>
            <Solid.Match when={currentMatch().status === 'notFound'}>
              {(_) => {
                const matchError = Solid.untrack(() => currentMatch().error)
                invariant(isNotFound(matchError), 'Expected a notFound error')

                // Use Show with keyed to ensure re-render when routeId changes
                return (
                  <Solid.Show when={currentMatchState().routeId} keyed>
                    {(_routeId) =>
                      Solid.untrack(() =>
                        renderRouteNotFound(router, route(), matchError),
                      )
                    }
                  </Solid.Show>
                )
              }}
            </Solid.Match>
            <Solid.Match when={currentMatch().status === 'redirected'}>
              {(_) => {
                const matchError = Solid.untrack(() => currentMatch().error)
                invariant(isRedirect(matchError), 'Expected a redirect error')

                return null
              }}
            </Solid.Match>
            <Solid.Match when={currentMatch().status === 'error'}>
              {(_) => {
                const matchError = Solid.untrack(() => currentMatch().error)
                if (isServer ?? router.isServer) {
                  const RouteErrorComponent =
                    (route().options.errorComponent ??
                      router.options.defaultErrorComponent) ||
                    ErrorComponent

                  return (
                    <RouteErrorComponent
                      error={matchError}
                      info={{
                        componentStack: '',
                      }}
                    />
                  )
                }

                throw matchError
              }}
            </Solid.Match>
            <Solid.Match when={currentMatch().status === 'success'}>
              {keyedOut()}
            </Solid.Match>
          </Solid.Switch>
        )
      }}
    </Solid.Show>
  )
}

export const Outlet = () => {
  const router = useRouter()
  const nearestParentMatch = Solid.useContext(nearestMatchContext)
  const parentMatch = nearestParentMatch.match
  const routeId = nearestParentMatch.routeId
  const route = Solid.createMemo(() =>
    routeId() ? router.routesById[routeId()!] : undefined,
  )

  const parentGlobalNotFound = Solid.createMemo(
    () => parentMatch()?.globalNotFound ?? false,
  )

  const childMatchId = Solid.createMemo(() => {
    const currentRouteId = routeId()
    return currentRouteId
      ? router.stores.childMatchIdByRouteId.state[currentRouteId]
      : undefined
  })

  const childRouteId = Solid.createMemo(() => {
    const id = childMatchId()
    if (!id) return undefined
    return router.stores.activeMatchStoresById.get(id)?.state.routeId
  })

  const childRoute = Solid.createMemo(() => {
    const id = childRouteId()
    return id ? (router.routesById[id] as AnyRoute) : undefined
  })

  const childPendingComponent = Solid.createMemo(
    () =>
      childRoute()?.options.pendingComponent ??
      router.options.defaultPendingComponent,
  )

  const childMatchStatus = Solid.createMemo(() => {
    const id = childMatchId()
    if (!id) return undefined
    return router.stores.activeMatchStoresById.get(id)?.state.status
  })

  // Only show not-found if we're not in a redirected state
  const shouldShowNotFound = () =>
    childMatchStatus() !== 'redirected' && parentGlobalNotFound()

  return (
    <Solid.Show
      when={!shouldShowNotFound() && childMatchId()}
      fallback={
        <Solid.Show when={shouldShowNotFound() && route()}>
          {(resolvedRoute) =>
            Solid.untrack(() =>
              renderRouteNotFound(router, resolvedRoute(), undefined),
            )
          }
        </Solid.Show>
      }
    >
      {(childMatchIdAccessor) => {
        const currentMatchId = Solid.createMemo(() => childMatchIdAccessor())

        return (
          <Solid.Show
            when={routeId() === rootRouteId}
            fallback={<Match matchId={currentMatchId()} />}
          >
            <Solid.Show when={childRouteId()} keyed>
              {(_routeId) => (
                <Solid.Loading
                  fallback={
                    childPendingComponent() ? (
                      <Dynamic component={childPendingComponent()} />
                    ) : null
                  }
                >
                  <Match matchId={currentMatchId()} />
                </Solid.Loading>
              )}
            </Solid.Show>
          </Solid.Show>
        )
      }}
    </Solid.Show>
  )
}
