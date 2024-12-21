'use client'

import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import { Dynamic } from 'solid-js/web'
import { createControlledPromise, pick } from '../common/utils'
import {
  defaultDeserializeError,
  isServerSideError,
} from '../common/isServerSideError'
import { rootRouteId } from '../common/root'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { CatchNotFound, isNotFound } from './not-found'
import { isRedirect } from './redirects'
import { matchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { renderRouteNotFound } from './renderRouteNotFound'
import type { AnyRoute } from './route'

export const Match = (props: { matchId: string }) => {
  const router = useRouter()
  const routeId = useRouterState({
    select: (s) =>
      s.matches.find((d) => d.id === props.matchId)?.routeId as string,
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

  return (
    <matchContext.Provider value={props.matchId}>
      <Dynamic
        component={ResolvedSuspenseBoundary()}
        fallback={<Dynamic component={PendingComponent} />}
      >
        <Dynamic
          component={ResolvedCatchBoundary()}
          resetKey={resetKey()}
          errorComponent={routeErrorComponent() || ErrorComponent}
          onCatch={(error) => {
            // Forward not found errors (we don't want to show the error component for these)
            if (isNotFound(error)) throw error
            warning(false, `Error in route match: ${props.matchId}`)
            routeOnCatch()?.(error)
          }}
        >
          <Dynamic
            component={ResolvedNotFoundBoundary()}
            fallback={(error) => {
              // If the current not found handler doesn't exist or it has a
              // route ID which doesn't match the current route, rethrow the error
              if (
                !routeNotFoundComponent() ||
                (error.routeId && error.routeId !== routeId) ||
                (!error.routeId && !route().isRoot)
              )
                throw error

              return <Dynamic component={routeNotFoundComponent} {...error} />
            }}
          >
            <MatchInner matchId={props.matchId} />
          </Dynamic>
        </Dynamic>
      </Dynamic>
    </matchContext.Provider>
  )
}

export const MatchInner = (props: { matchId: string }): any => {
  const router = useRouter()

  // { match, matchIndex, routeId } =
  const matchState = useRouterState({
    select: (s) => {
      const matchIndex = s.matches.findIndex((d) => d.id === props.matchId)
      const match = s.matches[matchIndex]!
      const routeId = match.routeId as string
      return {
        routeId,
        matchIndex,
        match: pick(match, ['id', 'status', 'error']),
      }
    },
  })

  const route = () => router.routesById[matchState().routeId]!

  // function useChangedDiff(value: any) {
  //   const ref = React.useRef(value)
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

  return (
    <Solid.Switch>
      <Solid.Match when={match().status === 'notFound'}>
        {(_) => {
          let error: unknown

          // not in a reactive context but it's probably fine
          const m = match()

          if (isServerSideError(m.error)) {
            const deserializeError =
              router.options.errorSerializer?.deserialize ??
              defaultDeserializeError

            error = deserializeError(m.error.data)
          } else {
            error = match().error
          }

          invariant(isNotFound(error), 'Expected a notFound error')

          return renderRouteNotFound(router, route(), error)
        }}
      </Solid.Match>
      <Solid.Match when={match().status === 'redirected'}>
        {(_) => {
          // Redirects should be handled by the router transition. If we happen to
          // encounter a redirect here, it's a bug. Let's warn, but render nothing.
          invariant(isRedirect(match().error), 'Expected a redirect error')

          // warning(
          //   false,
          //   'Tried to render a redirected route match! This is a weird circumstance, please file an issue!',
          // )
          throw router.getMatch(match().id)?.loadPromise
        }}
      </Solid.Match>
      <Solid.Match when={match().status === 'error'}>
        {(_) => {
          // If we're on the server, we need to use React's new and super
          // wonky api for throwing errors from a server side render inside
          // of a suspense boundary. This is the only way to get
          // renderToPipeableStream to not hang indefinitely.
          // We'll serialize the error and rethrow it on the client.
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

          const m = match()
          if (isServerSideError(m.error)) {
            const deserializeError =
              router.options.errorSerializer?.deserialize ??
              defaultDeserializeError
            throw deserializeError(m.error.data)
          } else {
            throw m.error
          }
        }}
      </Solid.Match>
      <Solid.Match when={match().status === 'pending'}>
        {(_) => {
          // We're pending, and if we have a minPendingMs, we need to wait for it
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
          throw router.getMatch(match().id)?.loadPromise
        }}
      </Solid.Match>
      <Solid.Match when={true}>
        <Dynamic
          component={
            route().options.component ?? router.options.defaultComponent
          }
        />
        {router.AfterEachMatch ? (
          <router.AfterEachMatch
            match={match()}
            matchIndex={matchState().matchIndex}
          />
        ) : null}
      </Solid.Match>
    </Solid.Switch>
  )
}

export const Outlet = () => {
  const router = useRouter()
  const matchId = Solid.useContext(matchContext)
  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId)?.routeId as string,
  })

  const route = () => router.routesById[routeId()]!

  const parentGlobalNotFound = useRouterState({
    select: (s) => {
      const matches = s.matches
      const parentMatch = matches.find((d) => d.id === matchId)
      invariant(
        parentMatch,
        `Could not find parent match for matchId "${matchId}"`,
      )
      return parentMatch.globalNotFound
    },
  })

  const childMatchId = useRouterState({
    select: (s) => {
      const matches = s.matches
      const index = matches.findIndex((d) => d.id === matchId)
      return matches[index + 1]?.id
    },
  })

  return (
    <Solid.Switch>
      <Solid.Match when={parentGlobalNotFound()}>
        {renderRouteNotFound(router, route(), undefined)}
      </Solid.Match>
      <Solid.Match when={childMatchId()}>
        {(matchId) => {
          const nextMatch = <Match matchId={matchId()} />

          return (
            <Solid.Show when={matchId() === rootRouteId} fallback={nextMatch}>
              <Solid.Suspense
                fallback={
                  <Dynamic component={router.options.defaultPendingComponent} />
                }
              >
                {nextMatch}
              </Solid.Suspense>
            </Solid.Show>
          )
        }}
      </Solid.Match>
    </Solid.Switch>
  )
}