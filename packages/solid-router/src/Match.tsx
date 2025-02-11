import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  createControlledPromise,
  getLocationChangeInfo,
  pick,
  rootRouteId,
} from '@tanstack/router-core'
import { Dynamic } from 'solid-js/web'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { CatchNotFound, isNotFound } from './not-found'
import { isRedirect } from './redirects'
import { matchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import type { AnyRoute } from './route'

export const Match = (props: { matchId: string }) => {
  const router = useRouter()
  const routeId = useRouterState({
    select: (s) => {
      return s.matches.find((d) => d.id === props.matchId)?.routeId as string
    },
  })

  invariant(
    routeId,
    `Could not find routeId for matchId "${props.matchId}". Please file an issue!`,
  )

  const route: () => AnyRoute = () => router.routesById[routeId()]

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

  const ResolvedSuspenseBoundary = () =>
    // If we're on the root route, allow forcefully wrapping in suspense
    (!route().isRoot || route().options.wrapInSuspense) &&
    (route().options.wrapInSuspense ??
      PendingComponent() ??
      (route().options.errorComponent as any)?.preload)
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

  return (
    <>
      <matchContext.Provider value={() => props.matchId}>
        <Dynamic
          component={ResolvedSuspenseBoundary()}
          fallback={<Dynamic component={PendingComponent()} />}
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
                  (error.routeId && error.routeId !== routeId) ||
                  (!error.routeId && !route().isRoot)
                )
                  throw error

                return (
                  <Dynamic component={routeNotFoundComponent()} {...error} />
                )
              }}
            >
              <MatchInner matchId={props.matchId} />
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
    </>
  )
}

// On Rendered can't happen above the root layout because it actually
// renders a dummy dom element to track the rendered state of the app.
// We render a script tag with a key that changes based on the current
// location state.key. Also, because it's below the root layout, it
// allows us to fire onRendered events even after a hydration mismatch
// error that occurred above the root layout (like bad head/link tags,
// which is common).
function OnRendered() {
  const router = useRouter()

  return (
    <script
      ref={(el) => {
        if (el) {
          router.emit({
            type: 'onRendered',
            ...getLocationChangeInfo(router.state),
          })
        }
      }}
    />
  )
}

export const MatchInner = (props: { matchId: string }): any => {
  const router = useRouter()

  // { match, key, routeId } =
  const matchState: Solid.Accessor<any> = useRouterState({
    select: (s) => {
      const matchIndex = s.matches.findIndex((d) => d.id === props.matchId)
      const match = s.matches[matchIndex]!
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
        match: pick(match, ['id', 'status', 'error']),
      }
    },
  })

  const route = () => router.routesById[matchState().routeId]!

  // function useChangedDiff(value: any) {
  //   const ref = Solid.useRef(value)
  //   const changed = ref.current !== value
  //   if (changed) {
  //     console.log(
  //       'Changed:',
  //       value,
  //       Object.fromEntries(
  //         Object.entries(value).filter(
  //           ([key, val]) => val !== ref.current[key],
  //         ),
  //       ),
  //     )
  //   }
  //   ref.current = value
  // }

  // useChangedDiff(match)
  const match = () => matchState().match

  const out = Solid.createMemo(() => {
    const Comp = route().options.component ?? router.options.defaultComponent
    if (Comp) {
      return <Comp />
    }
    return <Outlet />
  })

  return (
    <Solid.Switch>
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
            return router.getMatch(match().id)?.loadPromise
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
      <Solid.Match when={match().status === 'pending'}>
        {(_) => {
          const pendingMinMs =
            route().options.pendingMinMs ?? router.options.defaultPendingMinMs

          if (pendingMinMs && !router.getMatch(match().id)?.minPendingPromise) {
            // Create a promise that will resolve after the minPendingMs
            if (!router.isServer) {
              const minPendingPromise = createControlledPromise<void>()

              Promise.resolve().then(() => {
                router.updateMatch(match().id, (prev) => ({
                  ...prev,
                  minPendingPromise,
                }))
              })

              setTimeout(() => {
                minPendingPromise.resolve()

                // We've handled the minPendingPromise, so we can delete it
                router.updateMatch(match().id, (prev) => ({
                  ...prev,
                  minPendingPromise: undefined,
                }))
              }, pendingMinMs)
            }
          }

          const [loaderResult] = Solid.createResource(async () => {
            await new Promise((r) => setTimeout(r, 0))
            return router.getMatch(match().id)?.loadPromise
          })

          return <>{loaderResult()}</>
        }}
      </Solid.Match>
      <Solid.Match when={match().status === 'success'}>{out()}</Solid.Match>
    </Solid.Switch>
  )
}

export const Outlet = () => {
  const router = useRouter()
  const matchId = Solid.useContext(matchContext)
  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId())?.routeId as string,
  })

  const route = () => router.routesById[routeId()]!

  const parentGlobalNotFound = useRouterState({
    select: (s) => {
      const matches = s.matches
      const parentMatch = matches.find((d) => d.id === matchId())
      invariant(
        parentMatch,
        `Could not find parent match for matchId "${matchId()}"`,
      )
      return parentMatch.globalNotFound
    },
  })

  const childMatchId = useRouterState({
    select: (s) => {
      const matches = s.matches
      const index = matches.findIndex((d) => d.id === matchId())
      const v = matches[index + 1]?.id
      return v
    },
  })

  return (
    <Solid.Switch>
      <Solid.Match when={parentGlobalNotFound()}>
        {renderRouteNotFound(router, route(), undefined)}
      </Solid.Match>
      <Solid.Match when={childMatchId()}>
        {(matchId) => {
          // const nextMatch = <Match matchId={matchId()} />

          return (
            <Solid.Show
              when={matchId() === rootRouteId}
              fallback={<Match matchId={matchId()} />}
            >
              <Solid.Suspense
                fallback={
                  <Dynamic component={router.options.defaultPendingComponent} />
                }
              >
                <Match matchId={matchId()} />
              </Solid.Suspense>
            </Solid.Show>
          )
        }}
      </Solid.Match>
    </Solid.Switch>
  )
}
