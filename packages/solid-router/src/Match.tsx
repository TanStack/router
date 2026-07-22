import * as Solid from 'solid-js'
import { rootRouteId } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { Dynamic } from 'solid-js/web'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter } from './useRouter'
import { CatchNotFound, getNotFound } from './not-found'
import { nearestMatchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import { ClientOnly } from './ClientOnly'
import type {
  AnyRoute,
  AnyRouter,
  RootRouteOptions,
} from '@tanstack/router-core'

// Keep the client constant undefined so the server-only script can be dropped.
const renderScrollRestoration =
  isServer === false
    ? undefined
    : (router: AnyRouter, route: AnyRoute) =>
        (isServer ?? router.isServer) &&
        route.parentRoute?.id === rootRouteId &&
        router.options.scrollRestoration ? (
          <ScrollRestoration />
        ) : null

export const Match = (props: { routeId: string }) => {
  const router = useRouter()

  const currentMatch = Solid.createMemo(
    () => router.stores.byRoute.get(props.routeId)!.get()!,
  )

  const nearestMatch = {
    routeId: () => props.routeId,
    match: currentMatch,
  }

  const route: AnyRoute = router.routesById[props.routeId]

  // Lazy route option mutations become observable with the next client match
  // publication. Server stores are non-reactive and options load before render.
  const routeOptions =
    (isServer ?? router.isServer)
      ? () => route.options
      : () => {
          currentMatch()
          return route.options
        }

  const resolvePendingComponent = () =>
    routeOptions().pendingComponent ?? router.options.defaultPendingComponent

  const routeErrorComponent = () =>
    routeOptions().errorComponent ?? router.options.defaultErrorComponent

  const routeNotFoundComponent = () =>
    route.isRoot
      ? // If it's the root route, use the _notFound option, with fallback to the notFoundRoute's component
        (routeOptions().notFoundComponent ??
        router.options.notFoundRoute?.options.component)
      : routeOptions().notFoundComponent

  const resolvedNoSsr = () =>
    currentMatch().ssr === false || currentMatch().ssr === 'data-only'

  const shouldSkipSuspenseFallback = () =>
    (isServer ?? router.isServer)
      ? resolvedNoSsr()
      : currentMatch().ssr === 'data-only'

  const ShellComponent = route.isRoot
    ? ((route.options as RootRouteOptions).shellComponent ?? SafeFragment)
    : SafeFragment

  const MatchContent = () => (
    <Solid.Show
      when={currentMatch().status !== 'pending'}
      fallback={<Dynamic component={resolvePendingComponent()} />}
    >
      <MatchInner />
    </Solid.Show>
  )

  return (
    <ShellComponent>
      <nearestMatchContext.Provider value={nearestMatch}>
        <Solid.Suspense
          fallback={
            // Data-only SSR renders the inner fallback on the server, so
            // avoid adding an extra suspense fallback on the client.
            shouldSkipSuspenseFallback() ? undefined : (
              <Dynamic component={resolvePendingComponent()} />
            )
          }
        >
          <Dynamic
            component={routeErrorComponent() ? CatchBoundary : SafeFragment}
            getResetKey={currentMatch}
            errorComponent={routeErrorComponent() as any}
            onCatch={(error: Error) => {
              // Forward not found errors (we don't want to show the error component for these)
              const notFoundError = getNotFound(error)
              if (notFoundError) {
                notFoundError.routeId ??= currentMatch().routeId
                throw notFoundError
              }
              if (process.env.NODE_ENV !== 'production') {
                console.warn(
                  `Warning: Error in route match: ${currentMatch().routeId}`,
                )
              }
              ;(route.options.onCatch ?? router.options.defaultOnCatch)?.(error)
            }}
          >
            <Dynamic
              component={
                routeNotFoundComponent() ? CatchNotFound : SafeFragment
              }
              fallback={(error: any) => {
                const notFoundError = getNotFound(error) ?? error

                notFoundError.routeId ??= currentMatch().routeId

                if (notFoundError.routeId !== currentMatch().routeId) {
                  throw notFoundError
                }

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
                  <ClientOnly
                    fallback={<Dynamic component={resolvePendingComponent()} />}
                  >
                    <MatchContent />
                  </ClientOnly>
                </Solid.Match>
                <Solid.Match when={!resolvedNoSsr()}>
                  <MatchContent />
                </Solid.Match>
              </Solid.Switch>
            </Dynamic>
          </Dynamic>
        </Solid.Suspense>
      </nearestMatchContext.Provider>

      {renderScrollRestoration?.(router, route)}
    </ShellComponent>
  )
}

export const MatchInner = (): any => {
  const router = useRouter()
  const nearestMatch = Solid.useContext(nearestMatchContext)
  const match = nearestMatch.match
  const routeId = nearestMatch.routeId
  const route = router.routesById[routeId()!]!
  const currentMatch = () => match()!

  const componentKey = () => {
    const current = currentMatch()
    const remount =
      route.options.remountDeps ?? router.options.defaultRemountDeps
    const deps = remount?.({
      routeId: routeId()!,
      loaderDeps: current.loaderDeps,
      params: current._strictParams,
      search: current._strictSearch,
    })
    return deps ? JSON.stringify(deps) : current.id
  }

  const out = () => {
    const Comp = route.options.component ?? router.options.defaultComponent
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
      <Solid.Match when={currentMatch().status === 'notFound'}>
        {(_) => renderRouteNotFound(router, route, currentMatch().error)}
      </Solid.Match>
      <Solid.Match when={currentMatch().status === 'error'}>
        {(_) => {
          if (isServer ?? router.isServer) {
            const RouteErrorComponent =
              (route.options.errorComponent ??
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
  const nearestParentMatch = Solid.useContext(nearestMatchContext)
  const parentMatch = nearestParentMatch.match
  const routeId = nearestParentMatch.routeId
  const route = router.routesById[routeId()!]!

  const childRouteId = () => {
    if (parentMatch()!._notFound) {
      return
    }
    const ids = router.stores.ids.get()
    return ids[ids.indexOf(routeId()!) + 1]
  }

  return (
    <Solid.Show
      when={childRouteId()}
      keyed
      fallback={
        parentMatch()!._notFound
          ? renderRouteNotFound(router, route, parentMatch()!.error)
          : undefined
      }
    >
      {(_routeKey: string) => {
        return (
          <Solid.Show
            when={routeId() === rootRouteId}
            fallback={<Match routeId={childRouteId()!} />}
          >
            <Solid.Suspense
              fallback={
                <Dynamic component={router.options.defaultPendingComponent} />
              }
            >
              <Match routeId={childRouteId()!} />
            </Solid.Suspense>
          </Solid.Show>
        )
      }}
    </Solid.Show>
  )
}
