import * as Solid from 'solid-js'
import { rootRouteId } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { Dynamic } from '@solidjs/web'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter } from './useRouter'
import { CatchNotFound, getNotFound } from './not-found'
import { nearestMatchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import { ClientOnly } from './ClientOnly'
import {
  nonRouteComponentContext,
  renderInNonRouteComponentContext,
} from './nonRouteComponentContext'
import type {
  AnyRoute,
  AnyRouter,
  RootRouteOptions,
} from '@tanstack/router-core'

const NearestMatchContext = nearestMatchContext as unknown as Solid.Component<{
  value: any
  children?: any
}>

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
  const currentMatch = Solid.createMemo(() =>
    router.stores.getMatchStore(props.routeId).get(),
  )
  const matchState = Solid.createMemo(() => {
    const match = currentMatch()
    if (!match) {
      return null
    }

    return {
      routeId: match.routeId,
      ssr: match.ssr,
      status: match.status,
    }
  })
  const nearestMatch = [() => props.routeId, currentMatch] as const

  return (
    <Solid.Show when={matchState()}>
      {(currentMatchState) => {
        const route = router.routesById[props.routeId] as AnyRoute
        const routeOptions = () => {
          // Lazy route options become observable with the next publication.
          currentMatchState()
          return route.options
        }
        const resolvePendingComponent = Solid.createMemo(
          () =>
            routeOptions().pendingComponent ??
            router.options.defaultPendingComponent,
        )
        const routeErrorComponent = Solid.createMemo(
          () =>
            routeOptions().errorComponent ??
            router.options.defaultErrorComponent,
        )
        const routeNotFoundComponent = Solid.createMemo(() =>
          route.isRoot
            ? (routeOptions().notFoundComponent ??
              router.options.notFoundRoute?.options.component ??
              router.options.defaultNotFoundComponent)
            : (routeOptions().notFoundComponent ??
              router.options.defaultNotFoundComponent),
        )
        const resolvedNoSsr = Solid.createMemo(
          () =>
            currentMatchState().ssr === false ||
            currentMatchState().ssr === 'data-only',
        )
        const ResolvedLoadingBoundary = Solid.createMemo(() =>
          resolvedNoSsr() ? SafeFragment : Solid.Loading,
        )
        const shouldSkipLoadingFallback = Solid.createMemo(() =>
          (isServer ?? router.isServer)
            ? resolvedNoSsr()
            : currentMatchState().ssr === 'data-only',
        )
        const ResolvedNotFoundBoundary = Solid.createMemo(() =>
          routeNotFoundComponent() ? CatchNotFound : SafeFragment,
        )
        const ShellComponent = Solid.createMemo(() =>
          route.isRoot
            ? ((route.options as RootRouteOptions).shellComponent ??
              SafeFragment)
            : SafeFragment,
        )

        const MatchContent = () => (
          <Solid.Show
            when={currentMatchState().status !== 'pending'}
            fallback={(() => {
              if (process.env.NODE_ENV !== 'production') {
                return renderInNonRouteComponentContext(
                  () => <Dynamic component={resolvePendingComponent()} />,
                  'pendingComponent',
                )
              }
              return <Dynamic component={resolvePendingComponent()} />
            })()}
          >
            <MatchInner />
          </Solid.Show>
        )
        const RouteContent = () => (
          <Dynamic
            component={ResolvedNotFoundBoundary()}
            fallback={(error: any) => {
              const notFoundError = getNotFound(error) ?? error
              notFoundError.routeId ??= currentMatchState().routeId

              if (notFoundError.routeId !== currentMatchState().routeId) {
                throw notFoundError
              }

              return process.env.NODE_ENV !== 'production' ? (
                renderInNonRouteComponentContext(
                  () => (
                    <Dynamic
                      component={routeNotFoundComponent()}
                      {...notFoundError}
                    />
                  ),
                  'notFoundComponent',
                )
              ) : (
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
                  fallback={(() => {
                    if (process.env.NODE_ENV !== 'production') {
                      return renderInNonRouteComponentContext(
                        () => <Dynamic component={resolvePendingComponent()} />,
                        'pendingComponent',
                      )
                    }
                    return <Dynamic component={resolvePendingComponent()} />
                  })()}
                >
                  <MatchContent />
                </ClientOnly>
              </Solid.Match>
              <Solid.Match when={!resolvedNoSsr()}>
                <MatchContent />
              </Solid.Match>
            </Solid.Switch>
          </Dynamic>
        )

        return (
          <Dynamic component={ShellComponent()}>
            <NearestMatchContext value={nearestMatch}>
              <Dynamic
                component={ResolvedLoadingBoundary()}
                fallback={(() => {
                  // Data-only SSR renders the inner fallback on the server, so
                  // avoid adding an extra loading fallback on the client.
                  if (shouldSkipLoadingFallback()) {
                    return undefined
                  }
                  if (process.env.NODE_ENV !== 'production') {
                    return renderInNonRouteComponentContext(
                      () => <Dynamic component={resolvePendingComponent()} />,
                      'pendingComponent',
                    )
                  }
                  return <Dynamic component={resolvePendingComponent()} />
                })()}
              >
                <Solid.Show
                  when={routeErrorComponent()}
                  fallback={<RouteContent />}
                >
                  {(errorComponent) => (
                    <CatchBoundary
                      // Scope the reset key to this match and its
                      // descendants (whose errors bubble here when they
                      // have no errorComponent of their own): resetting on
                      // unrelated matches' transitions just re-throws the
                      // still-stale error and recreates the retried
                      // subtree mid-settle.
                      getResetKey={() => {
                        const matches = router.stores.matches.get()
                        const index = matches.findIndex(
                          (match) => match.routeId === props.routeId,
                        )
                        if (index === -1) {
                          return ''
                        }
                        let key = ''
                        for (let i = index; i < matches.length; i++) {
                          const match = matches[i]!
                          key += `${match.status}|${match.updatedAt},`
                        }
                        return key
                      }}
                      errorComponent={errorComponent() as any}
                      onCatch={(error: Error) => {
                        const notFoundError = getNotFound(error)
                        if (notFoundError) {
                          notFoundError.routeId ??= currentMatchState().routeId
                          throw notFoundError
                        }
                        if (process.env.NODE_ENV !== 'production') {
                          console.warn(
                            `Warning: Error in route match: ${currentMatchState().routeId}`,
                          )
                        }
                        ;(
                          routeOptions().onCatch ??
                          router.options.defaultOnCatch
                        )?.(error)
                      }}
                      render={RouteContent}
                    />
                  )}
                </Solid.Show>
              </Dynamic>
            </NearestMatchContext>

            {renderScrollRestoration?.(router, route)}
          </Dynamic>
        )
      }}
    </Solid.Show>
  )
}

export const MatchInner = (): any => {
  const router = useRouter()
  const nearestMatch = Solid.useContext(nearestMatchContext)
  const match = nearestMatch[1 /* match */]
  const routeId = nearestMatch[0 /* route id */]

  const matchState = Solid.createMemo(() => {
    const currentMatch = match()
    const currentRouteId = routeId()
    if (!currentMatch || !currentRouteId) {
      return null
    }

    const route = router.routesById[currentRouteId] as AnyRoute
    const remount =
      route.options.remountDeps ?? router.options.defaultRemountDeps
    let componentKey: string
    if (!remount) {
      componentKey = currentRouteId
    } else {
      const deps = remount({
        routeId: currentRouteId,
        loaderDeps: currentMatch.loaderDeps,
        params: currentMatch._strictParams,
        search: currentMatch._strictSearch,
      })
      componentKey = JSON.stringify(deps) ?? currentRouteId
    }

    return {
      route,
      routeId: currentRouteId,
      match: {
        id: currentMatch.id,
        status: currentMatch.status,
        error: currentMatch.error,
      },
      componentKey,
    }
  })

  return (
    <Solid.Show when={matchState()}>
      {(currentMatchState) => {
        const route = Solid.createMemo(() => currentMatchState().route)
        const currentMatch = Solid.createMemo(() => currentMatchState().match)
        const componentKey = Solid.createMemo(
          () => currentMatchState().componentKey,
        )
        const OutComponent = Solid.createMemo(
          () =>
            route().options.component ??
            router.options.defaultComponent ??
            Outlet,
        )
        const keyedOut = () => (
          <Solid.Show when={componentKey()} keyed>
            {(_key) => <Dynamic component={OutComponent()} />}
          </Solid.Show>
        )

        return (
          <Solid.Switch>
            <Solid.Match when={currentMatch().status === 'notFound'}>
              {(_) =>
                Solid.untrack(() =>
                  renderRouteNotFound(router, route(), currentMatch().error),
                )
              }
            </Solid.Match>
            <Solid.Match when={currentMatch().status === 'error'}>
              {(_) => {
                const matchError = Solid.untrack(
                  () => currentMatch().error,
                ) as Error
                if (isServer ?? router.isServer) {
                  const RouteErrorComponent =
                    (route().options.errorComponent ??
                      router.options.defaultErrorComponent) ||
                    ErrorComponent

                  return process.env.NODE_ENV !== 'production' ? (
                    renderInNonRouteComponentContext(
                      () => (
                        <RouteErrorComponent
                          error={matchError}
                          reset={undefined as any}
                          info={{ componentStack: '' }}
                        />
                      ),
                      'errorComponent',
                    )
                  ) : (
                    <RouteErrorComponent
                      error={matchError}
                      reset={undefined as any}
                      info={{ componentStack: '' }}
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
  if (process.env.NODE_ENV !== 'production') {
    const nonRouteComponent = Solid.useContext(nonRouteComponentContext!)
    if (nonRouteComponent) {
      console.warn(
        `Warning: An <Outlet /> was rendered inside a ${nonRouteComponent}. <Outlet /> should only be rendered inside a route component.`,
      )
    }
  }

  const router = useRouter()
  const nearestParentMatch = Solid.useContext(nearestMatchContext)
  const parentMatch = nearestParentMatch[1 /* match */]
  const routeId = nearestParentMatch[0 /* route id */]
  const route = Solid.createMemo(() => {
    const currentRouteId = routeId()
    return currentRouteId
      ? (router.routesById[currentRouteId] as AnyRoute)
      : undefined
  })
  const parentNotFound = Solid.createMemo(() => parentMatch()?._notFound)
  const parentNotFoundError = Solid.createMemo(() => parentMatch()?.error)
  const childRouteId = Solid.createMemo(() => {
    if (parentNotFound()) {
      return undefined
    }
    const currentRouteId = routeId()
    if (!currentRouteId) {
      return undefined
    }
    const ids = router.stores.ids.get()
    return ids[ids.indexOf(currentRouteId) + 1]
  })
  const childPendingComponent = Solid.createMemo(() => {
    const childId = childRouteId()
    return childId
      ? ((router.routesById[childId] as AnyRoute).options.pendingComponent ??
          router.options.defaultPendingComponent)
      : router.options.defaultPendingComponent
  })

  return (
    <Solid.Show
      when={childRouteId()}
      keyed
      fallback={
        <Solid.Show when={parentNotFound() && route()}>
          {(resolvedRoute) =>
            Solid.untrack(() =>
              renderRouteNotFound(
                router,
                resolvedRoute(),
                parentNotFoundError(),
              ),
            )
          }
        </Solid.Show>
      }
    >
      {(currentChildRouteId) => {
        const nextMatch = () => <Match routeId={currentChildRouteId} />
        return (
          <Solid.Show when={routeId() === rootRouteId} fallback={nextMatch()}>
            <Solid.Loading
              fallback={(() => {
                if (!childPendingComponent()) {
                  return null
                }
                if (process.env.NODE_ENV !== 'production') {
                  return renderInNonRouteComponentContext(
                    () => <Dynamic component={childPendingComponent()} />,
                    'pendingComponent',
                  )
                }
                return <Dynamic component={childPendingComponent()} />
              })()}
            >
              {nextMatch()}
            </Solid.Loading>
          </Solid.Show>
        )
      }}
    </Solid.Show>
  )
}
