import * as Solid from 'solid-js'
import {
  createControlledPromise,
  getLocationChangeInfo,
  invariant,
  isNotFound,
  isRedirect,
  rootRouteId,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { Dynamic } from '@solidjs/web'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter } from './useRouter'
import { CatchNotFound, getNotFound } from './not-found'
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
    return router.stores.matchStores.get(id)?.get()
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
      ? Boolean(router.stores.pendingRouteIds.get()[currentRouteId])
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

        // `defaultNotFoundComponent` must be resolved here at render time, not
        // via the lazy route-option mutation in load-matches (which only runs
        // when a notFound is actually handled). Route objects are module
        // singletons shared across server requests, so relying on that mutation
        // makes the presence of the CatchNotFound boundary — and therefore
        // Solid's hydration keys — depend on whether the server has previously
        // served a 404, while a freshly-hydrating client never has it applied.
        const routeNotFoundComponent = Solid.createMemo(() =>
          route().isRoot
            ? // If it's the root route, use the globalNotFound option, with fallback to the notFoundRoute's component
              (route().options.notFoundComponent ??
              router.options.notFoundRoute?.options.component ??
              router.options.defaultNotFoundComponent)
            : (route().options.notFoundComponent ??
              router.options.defaultNotFoundComponent),
        )

        const resolvedNoSsr = Solid.createMemo(
          () =>
            currentMatchState().ssr === false ||
            currentMatchState().ssr === 'data-only',
        )

        const ResolvedSuspenseBoundary = Solid.createMemo(() =>
          resolvedNoSsr() ? SafeFragment : Solid.Loading,
        )
        const shouldSkipSuspenseFallback = Solid.createMemo(() =>
          (isServer ?? router.isServer)
            ? resolvedNoSsr()
            : currentMatchState().ssr === 'data-only',
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
                  // Data-only SSR renders the inner fallback on the server, so
                  // avoid adding an extra suspense fallback on the client.
                  shouldSkipSuspenseFallback() ? undefined : (
                    <Dynamic component={resolvePendingComponent()} />
                  )
                }
              >
                <Dynamic
                  component={ResolvedCatchBoundary()}
                  getResetKey={() => router.stores.loadedAt.get()}
                  errorComponent={routeErrorComponent() || ErrorComponent}
                  onCatch={(error: Error) => {
                    // Forward not found errors (we don't want to show the error component for these)
                    const notFoundError = getNotFound(error)
                    if (notFoundError) {
                      notFoundError.routeId ??= currentMatchState()
                        .routeId as any
                      throw notFoundError
                    }
                    if (process.env.NODE_ENV !== 'production') {
                      console.warn(
                        `Warning: Error in route match: ${currentMatchState().routeId}`,
                      )
                    }
                    routeOnCatch()?.(error)
                  }}
                >
                  <Dynamic
                    component={ResolvedNotFoundBoundary()}
                    fallback={(error: any) => {
                      const notFoundError = getNotFound(error) ?? error

                      notFoundError.routeId ??= currentMatchState()
                        .routeId as any

                      // If the current not found handler doesn't exist or it has a
                      // route ID which doesn't match the current route, rethrow the error
                      if (
                        !routeNotFoundComponent() ||
                        (notFoundError.routeId &&
                          notFoundError.routeId !==
                            currentMatchState().routeId) ||
                        (!notFoundError.routeId && !route().isRoot)
                      )
                        throw notFoundError

                      return (
                        <Dynamic
                          component={routeNotFoundComponent()}
                          {...notFoundError}
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
                {router.options.scrollRestoration &&
                (isServer ?? router.isServer) ? (
                  <ScrollRestoration />
                ) : null}
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
    () => router.stores.resolvedLocation.get()?.state.__TSR_key,
  )
  Solid.createEffect(
    () =>
      [
        location(),
        router.stores.location.get(),
        router.stores.resolvedLocation.get(),
      ] as const,
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

        const getLoadPromise = (
          matchId: string,
          fallbackMatch:
            | {
                _nonReactive: {
                  loadPromise?: Promise<void>
                }
              }
            | undefined,
        ) => {
          return (
            router.getMatch(matchId)?._nonReactive.loadPromise ??
            fallbackMatch?._nonReactive.loadPromise
          )
        }

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

                const FallbackComponent = Solid.untrack(
                  () =>
                    route().options.pendingComponent ??
                    router.options.defaultPendingComponent,
                )

                // Only suspend on the load promise during SSR, where the
                // streaming engine needs the Loading boundary to wait for the
                // match to settle. On the client, suspending here means an
                // async source is live in the tree whenever a match is
                // pending; since Solid 2.0.0-beta.16 that routes every signal
                // write into a transition hold for the rest of the flush,
                // which breaks router-core's synchronous write-then-load
                // flows (e.g. invalidate() reloading a notFound match).
                if (isServer ?? router.isServer) {
                  const loaderResult = Solid.createMemo(
                    () =>
                      router.getMatch(currentMatch().id)?._nonReactive
                        .loadPromise,
                  )
                  return (
                    <>
                      {FallbackComponent && pendingMinMs > 0 ? (
                        <Dynamic component={FallbackComponent} />
                      ) : null}
                      {loaderResult()}
                    </>
                  )
                }

                return FallbackComponent ? (
                  <Dynamic component={FallbackComponent} />
                ) : null
              }}
            </Solid.Match>
            <Solid.Match when={currentMatch().status === 'notFound'}>
              {(_) => {
                const matchError = Solid.untrack(() => currentMatch().error)
                if (!isNotFound(matchError)) {
                  if (process.env.NODE_ENV !== 'production') {
                    throw new Error(
                      'Invariant failed: Expected a notFound error',
                    )
                  }
                  invariant()
                }

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
                if (!isRedirect(currentMatch().error)) {
                  if (process.env.NODE_ENV !== 'production') {
                    throw new Error(
                      'Invariant failed: Expected a redirect error',
                    )
                  }
                  invariant()
                }

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
      ? router.stores.childMatchIdByRouteId.get()[currentRouteId]
      : undefined
  })

  const childRouteId = Solid.createMemo(() => {
    const id = childMatchId()
    if (!id) return undefined
    return router.stores.matchStores.get(id)?.routeId
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
    return router.stores.matchStores.get(id)?.get().status
  })

  const shouldShowNotFound = () =>
    childMatchStatus() !== 'redirected' && parentGlobalNotFound()

  const childRouteKey = Solid.createMemo(() => {
    if (shouldShowNotFound()) return undefined
    const cid = childMatchId()
    if (!cid) return undefined
    return router.stores.matchStores.get(cid)?.routeId ?? cid
  })

  return (
    <Solid.Show
      when={childRouteKey()}
      keyed
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
      {(_routeKey) => {
        const currentMatchId = Solid.createMemo(() => childMatchId())

        return (
          <Solid.Show
            when={routeId() === rootRouteId}
            fallback={<Match matchId={currentMatchId()!} />}
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
                  <Match matchId={currentMatchId()!} />
                </Solid.Loading>
              )}
            </Solid.Show>
          </Solid.Show>
        )
      }}
    </Solid.Show>
  )
}
