import * as React from 'react'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { createControlledPromise, pick } from './utils'
import { CatchNotFound, DefaultGlobalNotFound, isNotFound } from './not-found'
import { isRedirect } from './redirects'
import { type AnyRouter, type RegisteredRouter } from './router'
import type { ResolveRelativePath, ToOptions } from './link'
import type { AnyRoute, ReactNode, StaticDataRouteOption } from './route'
import type {
  AllParams,
  FullSearchSchema,
  ParseRoute,
  RouteById,
  RouteByPath,
  RouteIds,
  RoutePaths,
} from './routeInfo'
import type {
  ControlledPromise,
  DeepPartial,
  Expand,
  NoInfer,
  StrictOrFrom,
} from './utils'

export const matchContext = React.createContext<string | undefined>(undefined)

export interface RouteMatch<
  TRouteId,
  TAllParams,
  TFullSearchSchema,
  TLoaderData,
  TAllContext,
  TRouteContext,
  TLoaderDeps,
> {
  id: string
  routeId: TRouteId
  pathname: string
  params: TAllParams
  status: 'pending' | 'success' | 'error' | 'redirected' | 'notFound'
  isFetching: false | 'beforeLoad' | 'loader'
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  loadPromise: ControlledPromise<void>
  loaderPromise: Promise<TLoaderData>
  loaderData?: TLoaderData
  routeContext: TRouteContext
  context: TAllContext
  search: TFullSearchSchema
  fetchCount: number
  abortController: AbortController
  cause: 'preload' | 'enter' | 'stay'
  loaderDeps: TLoaderDeps
  preload: boolean
  invalid: boolean
  meta?: Array<JSX.IntrinsicElements['meta']>
  links?: Array<JSX.IntrinsicElements['link']>
  scripts?: Array<JSX.IntrinsicElements['script']>
  headers?: Record<string, string>
  globalNotFound?: boolean
  staticData: StaticDataRouteOption
  minPendingPromise?: ControlledPromise<void>
}

export type MakeRouteMatch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TRouteId = ParseRoute<TRouteTree>['id'],
  TReturnIntersection extends boolean = false,
  TTypes extends AnyRoute['types'] = RouteById<TRouteTree, TRouteId>['types'],
  TAllParams = TReturnIntersection extends false
    ? TTypes['allParams']
    : Partial<AllParams<TRouteTree>>,
  TFullSearchSchema = TReturnIntersection extends false
    ? TTypes['fullSearchSchema']
    : Partial<FullSearchSchema<TRouteTree>>,
  TLoaderData = TTypes['loaderData'],
  TAllContext = TTypes['allContext'],
  TRouteContext = TTypes['routeContext'],
  TLoaderDeps = TTypes['loaderDeps'],
> = RouteMatch<
  TRouteId,
  TAllParams,
  TFullSearchSchema,
  TLoaderData,
  TAllContext,
  TRouteContext,
  TLoaderDeps
>

export type AnyRouteMatch = RouteMatch<any, any, any, any, any, any, any>

export function Matches() {
  const matchId = useRouterState({
    select: (s) => {
      return s.matches[0]?.id
    },
  })

  const resetKey = useRouterState({
    select: (s) => s.resolvedLocation.state.key!,
  })

  return (
    <matchContext.Provider value={matchId}>
      <CatchBoundary
        getResetKey={() => resetKey}
        errorComponent={ErrorComponent}
        onCatch={(error) => {
          warning(
            false,
            `The following error wasn't caught by any route! 👇 At the very least, consider setting an 'errorComponent' in your RootRoute!`,
          )
          console.error(error)
        }}
      >
        {matchId ? <Match matchId={matchId} /> : null}
      </CatchBoundary>
    </matchContext.Provider>
  )
}

function SafeFragment(props: any) {
  return <>{props.children}</>
}

export function Match({ matchId }: { matchId: string }) {
  const router = useRouter()
  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId)?.routeId as string,
  })

  invariant(
    routeId,
    `Could not find routeId for matchId "${matchId}". Please file an issue!`,
  )

  const route: AnyRoute = router.routesById[routeId]

  const PendingComponent =
    route.options.pendingComponent ?? router.options.defaultPendingComponent

  const pendingElement = PendingComponent ? <PendingComponent /> : null

  const routeErrorComponent =
    route.options.errorComponent ?? router.options.defaultErrorComponent

  const routeNotFoundComponent = route.isRoot
    ? // If it's the root route, use the globalNotFound option, with fallback to the notFoundRoute's component
      route.options.notFoundComponent ??
      router.options.notFoundRoute?.options.component
    : route.options.notFoundComponent

  const ResolvedSuspenseBoundary =
    route.options.wrapInSuspense ??
    PendingComponent ??
    route.options.component?.preload ??
    route.options.pendingComponent?.preload ??
    (route.options.errorComponent as any)?.preload
      ? React.Suspense
      : SafeFragment

  const ResolvedCatchBoundary = routeErrorComponent
    ? CatchBoundary
    : SafeFragment

  const ResolvedNotFoundBoundary = routeNotFoundComponent
    ? CatchNotFound
    : SafeFragment

  const resetKey = useRouterState({
    select: (s) => s.resolvedLocation.state.key!,
  })

  return (
    <matchContext.Provider value={matchId}>
      <ResolvedSuspenseBoundary fallback={pendingElement}>
        <ResolvedCatchBoundary
          getResetKey={() => resetKey}
          errorComponent={routeErrorComponent ?? ErrorComponent}
          onCatch={(error) => {
            // Forward not found errors (we don't want to show the error component for these)
            if (isNotFound(error)) throw error
            warning(false, `Error in route match: ${matchId}`)
            console.error(error)
          }}
        >
          <ResolvedNotFoundBoundary
            fallback={(error) => {
              // If the current not found handler doesn't exist or it has a
              // route ID which doesn't match the current route, rethrow the error
              if (
                !routeNotFoundComponent ||
                (error.routeId && error.routeId !== routeId) ||
                (!error.routeId && !route.isRoot)
              )
                throw error

              return React.createElement(routeNotFoundComponent, error as any)
            }}
          >
            <MatchInner matchId={matchId} />
          </ResolvedNotFoundBoundary>
        </ResolvedCatchBoundary>
      </ResolvedSuspenseBoundary>
    </matchContext.Provider>
  )
}

function MatchInner({
  matchId,
  // pendingElement,
}: {
  matchId: string
  // pendingElement: any
}): any {
  const router = useRouter()
  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId)?.routeId as string,
  })

  const route = router.routesById[routeId]!

  const match = useRouterState({
    select: (s) =>
      pick(s.matches.find((d) => d.id === matchId)!, [
        'id',
        'status',
        'error',
        'loadPromise',
        'minPendingPromise',
      ]),
  })

  const RouteErrorComponent =
    (route.options.errorComponent ?? router.options.defaultErrorComponent) ||
    ErrorComponent

  if (match.status === 'notFound') {
    let error: unknown
    if (isServerSideError(match.error)) {
      const deserializeError =
        router.options.errorSerializer?.deserialize ?? defaultDeserializeError

      error = deserializeError(match.error.data)
    } else {
      error = match.error
    }

    invariant(isNotFound(error), 'Expected a notFound error')

    return renderRouteNotFound(router, route, error)
  }

  if (match.status === 'redirected') {
    // Redirects should be handled by the router transition. If we happen to
    // encounter a redirect here, it's a bug. Let's warn, but render nothing.
    invariant(isRedirect(match.error), 'Expected a redirect error')

    warning(
      false,
      'Tried to render a redirected route match! This is a weird circumstance, please file an issue!',
    )

    return null
  }

  if (match.status === 'error') {
    // If we're on the server, we need to use React's new and super
    // wonky api for throwing errors from a server side render inside
    // of a suspense boundary. This is the only way to get
    // renderToPipeableStream to not hang indefinitely.
    // We'll serialize the error and rethrow it on the client.
    if (router.isServer) {
      return (
        <RouteErrorComponent
          error={match.error}
          info={{
            componentStack: '',
          }}
        />
      )
    }

    if (isServerSideError(match.error)) {
      const deserializeError =
        router.options.errorSerializer?.deserialize ?? defaultDeserializeError
      throw deserializeError(match.error.data)
    } else {
      throw match.error
    }
  }

  if (match.status === 'pending') {
    // We're pending, and if we have a minPendingMs, we need to wait for it
    const pendingMinMs =
      route.options.pendingMinMs ?? router.options.defaultPendingMinMs

    if (pendingMinMs && !match.minPendingPromise) {
      // Create a promise that will resolve after the minPendingMs

      match.minPendingPromise = createControlledPromise()

      if (!router.isServer) {
        Promise.resolve().then(() => {
          router.__store.setState((s) => ({
            ...s,
            matches: s.matches.map((d) =>
              d.id === match.id
                ? { ...d, minPendingPromise: createControlledPromise() }
                : d,
            ),
          }))
        })

        setTimeout(() => {
          // We've handled the minPendingPromise, so we can delete it
          router.__store.setState((s) => {
            return {
              ...s,
              matches: s.matches.map((d) =>
                d.id === match.id
                  ? {
                      ...d,
                      minPendingPromise:
                        (d.minPendingPromise?.resolve(), undefined),
                    }
                  : d,
              ),
            }
          })
        }, pendingMinMs)
      }
    }

    throw match.loadPromise
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (match.status === 'success') {
    const Comp = route.options.component ?? router.options.defaultComponent

    if (Comp) {
      return <Comp />
    }

    return <Outlet />
  }

  invariant(
    false,
    'Idle routeMatch status encountered during rendering! You should never see this. File an issue!',
  )
}

export const Outlet = React.memo(function Outlet() {
  const router = useRouter()
  const matchId = React.useContext(matchContext)
  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId)?.routeId as string,
  })

  const route = router.routesById[routeId]!

  const { parentGlobalNotFound } = useRouterState({
    select: (s) => {
      const matches = s.matches
      const parentMatch = matches.find((d) => d.id === matchId)
      invariant(
        parentMatch,
        `Could not find parent match for matchId "${matchId}"`,
      )
      return {
        parentGlobalNotFound: parentMatch.globalNotFound,
      }
    },
  })

  const childMatchId = useRouterState({
    select: (s) => {
      const matches = s.matches
      const index = matches.findIndex((d) => d.id === matchId)
      return matches[index + 1]?.id
    },
  })

  if (parentGlobalNotFound) {
    return renderRouteNotFound(router, route, undefined)
  }

  if (!childMatchId) {
    return null
  }

  return <Match matchId={childMatchId} />
})

function renderRouteNotFound(router: AnyRouter, route: AnyRoute, data: any) {
  if (!route.options.notFoundComponent) {
    if (router.options.defaultNotFoundComponent) {
      return <router.options.defaultNotFoundComponent data={data} />
    }

    if (process.env.NODE_ENV === 'development') {
      warning(
        route.options.notFoundComponent,
        `A notFoundError was encountered on the route with ID "${route.id}", but a notFoundComponent option was not configured, nor was a router level defaultNotFoundComponent configured. Consider configuring at least one of these to avoid TanStack Router's overly generic defaultNotFoundComponent (<div>Not Found<div>)`,
      )
    }

    return <DefaultGlobalNotFound />
  }

  return <route.options.notFoundComponent data={data} />
}

export interface MatchRouteOptions {
  pending?: boolean
  caseSensitive?: boolean
  includeSearch?: boolean
  fuzzy?: boolean
}

export type UseMatchRouteOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> = RoutePaths<
    TRouter['routeTree']
  >,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> = TFrom,
  TMaskTo extends string = '',
  TOptions extends ToOptions<
    TRouter,
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  > = ToOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  TRelaxedOptions = Omit<TOptions, 'search' | 'params'> &
    DeepPartial<Pick<TOptions, 'search' | 'params'>>,
> = TRelaxedOptions & MatchRouteOptions

export function useMatchRoute<TRouter extends AnyRouter = RegisteredRouter>() {
  const router = useRouter()

  return React.useCallback(
    <
      TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
      TTo extends string = '',
      TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
      TMaskTo extends string = '',
      TResolved extends string = ResolveRelativePath<TFrom, NoInfer<TTo>>,
    >(
      opts: UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
    ):
      | false
      | RouteById<TRouter['routeTree'], TResolved>['types']['allParams'] => {
      const { pending, caseSensitive, fuzzy, includeSearch, ...rest } = opts

      return router.matchRoute(rest as any, {
        pending,
        caseSensitive,
        fuzzy,
        includeSearch,
      })
    },
    [router],
  )
}

export type MakeMatchRouteOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> = RoutePaths<
    TRouter['routeTree']
  >,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> = TFrom,
  TMaskTo extends string = '',
> = UseMatchRouteOptions<
  TRouter['routeTree'],
  TFrom,
  TTo,
  TMaskFrom,
  TMaskTo
> & {
  // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
  children?:
    | ((
        params?: RouteByPath<
          TRouter['routeTree'],
          ResolveRelativePath<TFrom, NoInfer<TTo>>
        >['types']['allParams'],
      ) => ReactNode)
    | React.ReactNode
}

export function MatchRoute<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> = RoutePaths<
    TRouter['routeTree']
  >,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> = TFrom,
  TMaskTo extends string = '',
>(
  props: MakeMatchRouteOptions<
    TRouter['routeTree'],
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  >,
): any {
  const matchRoute = useMatchRoute()
  const params = matchRoute(props as any)

  if (typeof props.children === 'function') {
    return (props.children as any)(params)
  }

  return params ? props.children : null
}

export function useMatch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TReturnIntersection extends boolean = false,
  TRouteMatch = MakeRouteMatch<TRouteTree, TFrom, TReturnIntersection>,
  TSelected = TRouteMatch,
>(
  opts: StrictOrFrom<TFrom, TReturnIntersection> & {
    select?: (match: TRouteMatch) => TSelected
  },
): TSelected {
  const nearestMatchId = React.useContext(matchContext)

  const matchSelection = useRouterState({
    select: (state) => {
      const match = state.matches.find((d) =>
        opts.from ? opts.from === d.routeId : d.id === nearestMatchId,
      )

      invariant(
        match,
        `Could not find ${
          opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'
        }`,
      )

      return opts.select ? opts.select(match as any) : match
    },
  })

  return matchSelection as TSelected
}

export function useMatches<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TRouteId extends RouteIds<TRouteTree> = ParseRoute<TRouteTree>['id'],
  TReturnIntersection extends boolean = false,
  TRouteMatch = MakeRouteMatch<TRouteTree, TRouteId, TReturnIntersection>,
  T = Array<TRouteMatch>,
>(opts?: {
  select?: (matches: Array<TRouteMatch>) => T
  experimental_returnIntersection?: TReturnIntersection
}): T {
  return useRouterState({
    select: (state) => {
      const matches = state.matches
      return opts?.select
        ? opts.select(matches as Array<TRouteMatch>)
        : (matches as T)
    },
  })
}

export function useParentMatches<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TRouteId extends RouteIds<TRouteTree> = ParseRoute<TRouteTree>['id'],
  TReturnIntersection extends boolean = false,
  TRouteMatch = MakeRouteMatch<TRouteTree, TRouteId, TReturnIntersection>,
  T = Array<TRouteMatch>,
>(opts?: {
  select?: (matches: Array<TRouteMatch>) => T
  experimental_returnIntersection?: TReturnIntersection
}): T {
  const contextMatchId = React.useContext(matchContext)

  return useMatches({
    select: (matches) => {
      matches = matches.slice(
        0,
        matches.findIndex((d) => d.id === contextMatchId),
      )
      return opts?.select
        ? opts.select(matches as Array<TRouteMatch>)
        : (matches as T)
    },
  })
}

export function useChildMatches<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TRouteId extends RouteIds<TRouteTree> = ParseRoute<TRouteTree>['id'],
  TReturnIntersection extends boolean = false,
  TRouteMatch = MakeRouteMatch<TRouteTree, TRouteId, TReturnIntersection>,
  T = Array<TRouteMatch>,
>(opts?: {
  select?: (matches: Array<TRouteMatch>) => T
  experimental_returnIntersection?: TReturnIntersection
}): T {
  const contextMatchId = React.useContext(matchContext)

  return useMatches({
    select: (matches) => {
      matches = matches.slice(
        matches.findIndex((d) => d.id === contextMatchId) + 1,
      )
      return opts?.select
        ? opts.select(matches as Array<TRouteMatch>)
        : (matches as T)
    },
  })
}

export function useLoaderDeps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TRouteMatch extends MakeRouteMatch<TRouteTree, TFrom> = MakeRouteMatch<
    TRouteTree,
    TFrom
  >,
  TSelected = Required<TRouteMatch>['loaderDeps'],
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (match: TRouteMatch) => TSelected
  },
): TSelected {
  return useMatch({
    ...opts,
    select: (s) => {
      return typeof opts.select === 'function'
        ? opts.select(s.loaderDeps)
        : s.loaderDeps
    },
  })
}

export function useLoaderData<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TRouteMatch extends MakeRouteMatch<TRouteTree, TFrom> = MakeRouteMatch<
    TRouteTree,
    TFrom
  >,
  TSelected = Required<TRouteMatch>['loaderData'],
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (match: TRouteMatch) => TSelected
  },
): TSelected {
  return useMatch({
    ...opts,
    select: (s) => {
      return typeof opts.select === 'function'
        ? opts.select(s.loaderData as TRouteMatch)
        : s.loaderData
    },
  }) as TSelected
}

export function isServerSideError(error: unknown): error is {
  __isServerError: true
  data: Record<string, any>
} {
  if (!(typeof error === 'object' && error && 'data' in error)) return false
  if (!('__isServerError' in error && error.__isServerError)) return false
  if (!(typeof error.data === 'object' && error.data)) return false

  return error.__isServerError === true
}

export function defaultDeserializeError(serializedData: Record<string, any>) {
  if ('name' in serializedData && 'message' in serializedData) {
    const error = new Error(serializedData.message)
    error.name = serializedData.name
    if (process.env.NODE_ENV === 'development') {
      error.stack = serializedData.stack
    }
    return error
  }

  return serializedData.data
}
