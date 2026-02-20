import * as Solid from 'solid-js'
import { useStore } from '@tanstack/solid-store'
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
import { Dynamic } from 'solid-js/web'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { matchContext, pendingMatchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import { useStoreOfStoresValue } from './storeOfStores'
import type { AnyRoute, RootRouteOptions } from '@tanstack/router-core'

function useActiveMatchStore(matchId: Solid.Accessor<string | undefined>) {
  const router = useRouter()
  const byId = useStore(router.byIdStore, (stores) => stores)
  return Solid.createMemo(() => {
    const id = matchId()
    return id ? byId()[id] : undefined
  })
}

function useResolvedActiveMatch(matchId: Solid.Accessor<string | undefined>) {
  const router = useRouter()
  const activeMatchStore = useActiveMatchStore(matchId)
  const activeMatch = useStoreOfStoresValue(activeMatchStore, (value) => value)

  // Keep the last seen routeId to recover from transient stale matchId values
  // during same-route transitions (e.g. loaderDepsHash changes).
  const fallbackRouteId = Solid.createMemo<string | undefined>(
    (previousRouteId) =>
      (activeMatch()?.routeId as string | undefined) ?? previousRouteId,
  )
  const byRouteId = useStore(router.byRouteIdStore, (stores) => stores)
  const fallbackMatchStore = Solid.createMemo(() => {
    const routeId = fallbackRouteId()
    return routeId ? byRouteId()[routeId] : undefined
  })
  const fallbackMatch = useStoreOfStoresValue(
    fallbackMatchStore,
    (value) => value,
  )

  return Solid.createMemo(() => activeMatch() ?? fallbackMatch())
}

export const Match = (props: { matchId: string }) => {
  const router = useRouter()
  const match = useResolvedActiveMatch(() => props.matchId)
  const activeMatchIds = useStore(router.matchesIdStore, (ids) => ids)
  const resetKey = useStore(router.loadedAtStore, (loadedAt) => loadedAt)

  const matchState = Solid.createMemo(() => {
    const currentMatch = match()
    if (!currentMatch) {
      return null
    }

    const matchIndex = activeMatchIds().findIndex((id) => id === currentMatch.id)
    const parentMatchId = activeMatchIds()[matchIndex - 1]
    const parentRouteId = parentMatchId
      ? router.byIdStore.state[parentMatchId]?.state.routeId
      : undefined

    return {
      matchId: currentMatch.id,
      routeId: currentMatch.routeId as string,
      ssr: currentMatch.ssr,
      _displayPending: currentMatch._displayPending,
      parentRouteId: parentRouteId as string | undefined,
    }
  })

  const isPendingMatch = useStore(
    router.pendingMatchesIdStore,
    (ids) => ids,
  )
  const hasPendingMatch = Solid.createMemo(() => {
    const currentMatchId = matchState()?.matchId
    return currentMatchId ? isPendingMatch().includes(currentMatchId) : false
  })

  // If match doesn't exist yet, return null (component is being unmounted or not ready)
  if (!matchState()) return null

  const route: () => AnyRoute = () => router.routesById[matchState()!.routeId]

  const resolvePendingComponent = () =>
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

  const ResolvedSuspenseBoundary = () => Solid.Suspense

  const ResolvedCatchBoundary = () =>
    routeErrorComponent() ? CatchBoundary : SafeFragment

  const ResolvedNotFoundBoundary = () =>
    routeNotFoundComponent() ? CatchNotFound : SafeFragment

  const ShellComponent = route().isRoot
    ? ((route().options as RootRouteOptions).shellComponent ?? SafeFragment)
    : SafeFragment

  return (
    <ShellComponent>
      <matchContext.Provider value={() => matchState()!.matchId}>
        <pendingMatchContext.Provider value={hasPendingMatch}>
          <Dynamic
            component={ResolvedSuspenseBoundary()}
            fallback={
              // Don't show fallback on server when using no-ssr mode to avoid hydration mismatch
              (isServer ?? router.isServer) && resolvedNoSsr ? undefined : (
                <Dynamic component={resolvePendingComponent()} />
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
                warning(false, `Error in route match: ${matchState()!.routeId}`)
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
                      when={!(isServer ?? router.isServer)}
                      fallback={<Dynamic component={resolvePendingComponent()} />}
                    >
                      <MatchInner matchId={matchState()!.matchId} />
                    </Solid.Show>
                  </Solid.Match>
                  <Solid.Match when={!resolvedNoSsr}>
                    <MatchInner matchId={matchState()!.matchId} />
                  </Solid.Match>
                </Solid.Switch>
              </Dynamic>
            </Dynamic>
          </Dynamic>
        </pendingMatchContext.Provider>
      </matchContext.Provider>

      {matchState()?.parentRouteId === rootRouteId ? (
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

  const location = useStore(
    router.resolvedLocationStore,
    (resolvedLocation) => resolvedLocation?.state.__TSR_key,
  )
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
  const match = useResolvedActiveMatch(() => props.matchId)

  const matchState = Solid.createMemo(() => {
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

  // If match doesn't exist yet, return null (component is being unmounted or not ready)
  if (!matchState()) return null

  const route = () => router.routesById[matchState()!.routeId]!

  const currentMatch = () => matchState()!.match

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
      <Solid.Match when={currentMatch()._displayPending}>
        {(_) => {
          const [displayPendingResult] = Solid.createResource(
            () =>
              router.getMatch(currentMatch().id)?._nonReactive.displayPendingPromise,
          )

          return <>{displayPendingResult()}</>
        }}
      </Solid.Match>
      <Solid.Match when={currentMatch()._forcePending}>
        {(_) => {
          const [minPendingResult] = Solid.createResource(
            () => router.getMatch(currentMatch().id)?._nonReactive.minPendingPromise,
          )

          return <>{minPendingResult()}</>
        }}
      </Solid.Match>
      <Solid.Match when={currentMatch().status === 'pending'}>
        {(_) => {
          const pendingMinMs =
            route().options.pendingMinMs ?? router.options.defaultPendingMinMs

          if (pendingMinMs) {
            const routerMatch = router.getMatch(currentMatch().id)
            if (routerMatch && !routerMatch._nonReactive.minPendingPromise) {
              // Create a promise that will resolve after the minPendingMs
              if (!(isServer ?? router.isServer)) {
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
            return router.getMatch(currentMatch().id)?._nonReactive.loadPromise
          })

          const FallbackComponent =
            route().options.pendingComponent ??
            router.options.defaultPendingComponent

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
          invariant(isNotFound(currentMatch().error), 'Expected a notFound error')

          // Use Show with keyed to ensure re-render when routeId changes
          return (
            <Solid.Show when={matchState()!.routeId} keyed>
              {(_routeId) =>
                renderRouteNotFound(router, route(), currentMatch().error)
              }
            </Solid.Show>
          )
        }}
      </Solid.Match>
      <Solid.Match when={currentMatch().status === 'redirected'}>
        {(_) => {
          invariant(isRedirect(currentMatch().error), 'Expected a redirect error')

          const [loaderResult] = Solid.createResource(async () => {
            await new Promise((r) => setTimeout(r, 0))
            return router.getMatch(currentMatch().id)?._nonReactive.loadPromise
          })

          return <>{loaderResult()}</>
        }}
      </Solid.Match>
      <Solid.Match when={currentMatch().status === 'error'}>
        {(_) => {
          if (isServer ?? router.isServer) {
            const RouteErrorComponent =
              (route().options.errorComponent ??
                router.options.defaultErrorComponent) ||
              ErrorComponent

            return (
              <RouteErrorComponent
                error={currentMatch().error}
                info={{
                  componentStack: '',
                }}
              />
            )
          }

          throw currentMatch().error
        }}
      </Solid.Match>
      <Solid.Match when={currentMatch().status === 'success'}>
        {keyedOut()}
      </Solid.Match>
    </Solid.Switch>
  )
}

export const Outlet = () => {
  const router = useRouter()
  const matchId = Solid.useContext(matchContext)
  const parentMatchStore = useActiveMatchStore(() => matchId())
  const routeId = useStoreOfStoresValue(
    parentMatchStore,
    (parentMatch) => parentMatch?.routeId as string | undefined,
  )
  const route = Solid.createMemo(() =>
    routeId() ? router.routesById[routeId()!] : undefined,
  )

  const parentGlobalNotFound = useStoreOfStoresValue(
    parentMatchStore,
    (parentMatch) => parentMatch?.globalNotFound ?? false,
  )

  const matchIds = useStore(router.matchesIdStore, (ids) => ids)
  const childMatchId = Solid.createMemo(() => {
    const ids = matchIds()
    const index = ids.findIndex((id) => id === matchId())
    return ids[index + 1]
  })

  const childMatchStore = useActiveMatchStore(childMatchId)
  const childMatchStatus = useStoreOfStoresValue(
    childMatchStore,
    (childMatch) => childMatch?.status,
  )

  // Only show not-found if we're not in a redirected state
  const shouldShowNotFound = () =>
    childMatchStatus() !== 'redirected' && parentGlobalNotFound()

  return (
    <Solid.Show
      when={!shouldShowNotFound() && childMatchId()}
      fallback={
        <Solid.Show when={shouldShowNotFound() && route()}>
          {(resolvedRoute) =>
            renderRouteNotFound(router, resolvedRoute(), undefined)
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
            <Solid.Suspense
              fallback={
                <Dynamic component={router.options.defaultPendingComponent} />
              }
            >
              <Match matchId={currentMatchId()} />
            </Solid.Suspense>
          </Solid.Show>
        )
      }}
    </Solid.Show>
  )
}
