import * as React from 'react'
import warning from 'tiny-warning'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Transitioner } from './Transitioner'
import { matchContext } from './matchContext'
import { Match } from './Match'
import { SafeFragment } from './SafeFragment'
import type { AnyRoute, ReactNode, StaticDataRouteOption } from './route'
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
import type {
  Constrain,
  ControlledPromise,
  DeepPartial,
  NoInfer,
} from './utils'

export type AnyMatchAndValue = { match: any; value: any }

export type FindValueByIndex<
  TKey,
  TValue extends ReadonlyArray<any>,
> = TKey extends `${infer TIndex extends number}` ? TValue[TIndex] : never

export type FindValueByKey<TKey, TValue> =
  TValue extends ReadonlyArray<any>
    ? FindValueByIndex<TKey, TValue>
    : TValue[TKey & keyof TValue]

export type CreateMatchAndValue<TMatch, TValue> = TValue extends any
  ? {
      match: TMatch
      value: TValue
    }
  : never

export type NextMatchAndValue<
  TKey,
  TMatchAndValue extends AnyMatchAndValue,
> = TMatchAndValue extends any
  ? CreateMatchAndValue<
      TMatchAndValue['match'],
      FindValueByKey<TKey, TMatchAndValue['value']>
    >
  : never

export type IsMatchKeyOf<TValue> =
  TValue extends ReadonlyArray<any>
    ? number extends TValue['length']
      ? `${number}`
      : keyof TValue & `${number}`
    : TValue extends object
      ? keyof TValue & string
      : never

export type IsMatchPath<
  TParentPath extends string,
  TMatchAndValue extends AnyMatchAndValue,
> = `${TParentPath}${IsMatchKeyOf<TMatchAndValue['value']>}`

export type IsMatchResult<
  TKey,
  TMatchAndValue extends AnyMatchAndValue,
> = TMatchAndValue extends any
  ? TKey extends keyof TMatchAndValue['value']
    ? TMatchAndValue['match']
    : never
  : never

export type IsMatchParse<
  TPath,
  TMatchAndValue extends AnyMatchAndValue,
  TParentPath extends string = '',
> = TPath extends `${string}.${string}`
  ? TPath extends `${infer TFirst}.${infer TRest}`
    ? IsMatchParse<
        TRest,
        NextMatchAndValue<TFirst, TMatchAndValue>,
        `${TParentPath}${TFirst}.`
      >
    : never
  : {
      path: IsMatchPath<TParentPath, TMatchAndValue>
      result: IsMatchResult<TPath, TMatchAndValue>
    }

export type IsMatch<TMatch, TPath> = IsMatchParse<
  TPath,
  TMatch extends any ? { match: TMatch; value: TMatch } : never
>

/**
 * Narrows matches based on a path
 * @experimental
 */
export const isMatch = <TMatch, TPath extends string>(
  match: TMatch,
  path: Constrain<TPath, IsMatch<TMatch, TPath>['path']>,
): match is IsMatch<TMatch, TPath>['result'] => {
  const parts = (path as string).split('.')
  let part
  let value: any = match

  while ((part = parts.shift()) != null && value != null) {
    value = value[part]
  }

  return value != null
}

export interface RouteMatch<
  TRouteId,
  TFullPath,
  TAllParams,
  TFullSearchSchema,
  TLoaderData,
  TAllContext,
  TLoaderDeps,
> {
  id: string
  routeId: TRouteId
  fullPath: TFullPath
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
  __routeContext: Record<string, unknown>
  __beforeLoadContext: Record<string, unknown>
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
  TRouteId = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
> = RouteMatch<
  TRouteId,
  RouteById<TRouteTree, TRouteId>['types']['fullPath'],
  TStrict extends false
    ? AllParams<TRouteTree>
    : RouteById<TRouteTree, TRouteId>['types']['allParams'],
  TStrict extends false
    ? FullSearchSchema<TRouteTree>
    : RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema'],
  TStrict extends false
    ? AllLoaderData<TRouteTree>
    : RouteById<TRouteTree, TRouteId>['types']['loaderData'],
  TStrict extends false
    ? AllContext<TRouteTree>
    : RouteById<TRouteTree, TRouteId>['types']['allContext'],
  RouteById<TRouteTree, TRouteId>['types']['loaderDeps']
>

export type AnyRouteMatch = RouteMatch<any, any, any, any, any, any, any>

export function Matches() {
  const router = useRouter()

  const pendingElement = router.options.defaultPendingComponent ? (
    <router.options.defaultPendingComponent />
  ) : null

  // Do not render a root Suspense during SSR or hydrating from SSR
  const ResolvedSuspense =
    router.isServer || (typeof document !== 'undefined' && window.__TSR__)
      ? SafeFragment
      : React.Suspense

  const inner = (
    <ResolvedSuspense fallback={pendingElement}>
      <Transitioner />
      <MatchesInner />
    </ResolvedSuspense>
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
  TFrom extends RoutePaths<TRouter['routeTree']> | string = RoutePaths<
    TRouter['routeTree']
  >,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
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

export type MakeRouteMatchUnion<
  TRouter extends AnyRouter = RegisteredRouter,
  TRoute extends AnyRoute = ParseRoute<TRouter['routeTree']>,
> = TRoute extends any
  ? RouteMatch<
      TRoute['id'],
      TRoute['fullPath'],
      TRoute['types']['allParams'],
      TRoute['types']['fullSearchSchema'],
      TRoute['types']['loaderData'],
      TRoute['types']['allContext'],
      TRoute['types']['loaderDeps']
    >
  : never

export function useMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TRouteMatch = MakeRouteMatchUnion<TRouter>,
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
  TRouter extends AnyRouter = RegisteredRouter,
  TRouteMatch = MakeRouteMatchUnion<TRouter>,
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
  TRouter extends AnyRouter = RegisteredRouter,
  TRouteMatch = MakeRouteMatchUnion<TRouter>,
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
