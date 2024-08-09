import * as React from 'react'
import warning from 'tiny-warning'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Transitioner } from './Transitioner'
import {
  type AnyRoute,
  type ReactNode,
  type StaticDataRouteOption,
} from './route'
import { matchContext } from './matchContext'
import { Match } from './Match'
import { SafeFragment } from './SafeFragment'
import type { AnyRouter, RegisteredRouter } from './router'
import type { ResolveRelativePath, ToOptions } from './link'
import type {
  AllContext,
  AllLoaderData,
  AllParams,
  FullSearchSchema,
  ParseRoute,
  RouteById,
  RouteByPath,
  RouteIds,
  RoutePaths,
} from './routeInfo'
import type { ControlledPromise, DeepPartial, NoInfer } from './utils'

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
  index: number
  pathname: string
  params: TAllParams
  status: 'pending' | 'success' | 'error' | 'redirected' | 'notFound'
  isFetching: false | 'beforeLoad' | 'loader'
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  componentsPromise?: Promise<Array<void>>
  loadPromise?: ControlledPromise<void>
  beforeLoadPromise?: ControlledPromise<void>
  loaderPromise?: ControlledPromise<void>
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
  meta?: Array<React.JSX.IntrinsicElements['meta']>
  links?: Array<React.JSX.IntrinsicElements['link']>
  scripts?: Array<React.JSX.IntrinsicElements['script']>
  headers?: Record<string, string>
  globalNotFound?: boolean
  staticData: StaticDataRouteOption
  minPendingPromise?: ControlledPromise<void>
  pendingTimeout?: ReturnType<typeof setTimeout>
}

export type MakeRouteMatch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TRouteId = ParseRoute<TRouteTree>['id'],
  TStrict extends boolean = true,
  TTypes extends AnyRoute['types'] = RouteById<TRouteTree, TRouteId>['types'],
  TAllParams = TStrict extends false
    ? AllParams<TRouteTree>
    : TTypes['allParams'],
  TFullSearchSchema = TStrict extends false
    ? FullSearchSchema<TRouteTree>
    : TTypes['fullSearchSchema'],
  TLoaderData = TStrict extends false
    ? AllLoaderData<TRouteTree>
    : TTypes['loaderData'],
  TAllContext = TStrict extends false
    ? AllContext<TRouteTree>
    : TTypes['allContext'],
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
  const router = useRouter()

  const pendingElement = router.options.defaultPendingComponent ? (
    <router.options.defaultPendingComponent />
  ) : null

  const inner = (
    <React.Suspense fallback={pendingElement}>
      <Transitioner />
      <MatchesInner />
    </React.Suspense>
  )

  return router.options.InnerWrap ? (
    <router.options.InnerWrap>{inner}</router.options.InnerWrap>
  ) : (
    inner
  )
}

function MatchesInner() {
  const matchId = useRouterState({
    select: (s) => {
      return s.matches[0]?.id
    },
  })

  const resetKey = useRouterState({
    select: (s) => s.loadedAt,
  })

  return (
    <matchContext.Provider value={matchId}>
      <CatchBoundary
        getResetKey={() => resetKey}
        errorComponent={ErrorComponent}
        onCatch={(error) => {
          warning(
            false,
            `The following error wasn't caught by any route! At the very least, consider setting an 'errorComponent' in your RootRoute!`,
          )
          warning(false, error.message || error.toString())
        }}
      >
        {matchId ? <Match matchId={matchId} /> : null}
      </CatchBoundary>
    </matchContext.Provider>
  )
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

  useRouterState({
    select: (s) => [s.location.href, s.resolvedLocation.href, s.status],
  })

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
      | RouteByPath<TRouter['routeTree'], TResolved>['types']['allParams'] => {
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
> = UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
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
>(props: MakeMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): any {
  const matchRoute = useMatchRoute()
  const params = matchRoute(props as any)

  if (typeof props.children === 'function') {
    return (props.children as any)(params)
  }

  return params ? props.children : null
}

export function useMatches<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TRouteId extends RouteIds<TRouteTree> = ParseRoute<TRouteTree>['id'],
  TRouteMatch = MakeRouteMatch<TRouteTree, TRouteId>,
  T = Array<TRouteMatch>,
>(opts?: { select?: (matches: Array<TRouteMatch>) => T }): T {
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
  TRouteMatch = MakeRouteMatch<TRouteTree, TRouteId>,
  T = Array<TRouteMatch>,
>(opts?: { select?: (matches: Array<TRouteMatch>) => T }): T {
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
  TRouteMatch = MakeRouteMatch<TRouteTree, TRouteId>,
  T = Array<TRouteMatch>,
>(opts?: { select?: (matches: Array<TRouteMatch>) => T }): T {
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
