import * as React from 'react'
import warning from 'tiny-warning'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Transitioner } from './Transitioner'
import { matchContext } from './matchContext'
import { Match } from './Match'
import { SafeFragment } from './SafeFragment'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type { AnyRoute, ReactNode, StaticDataRouteOption } from './route'
import type { AnyRouter, RegisteredRouter, RouterState } from './router'
import type {
  MakeOptionalPathParams,
  MakeOptionalSearchParams,
  MaskOptions,
  ResolveRelativePath,
  ResolveRoute,
  ToSubOptionsProps,
} from './link'
import type {
  AllContext,
  AllLoaderData,
  AllParams,
  FullSearchSchema,
  ParseRoute,
  RouteById,
  RouteByPath,
  RouteIds,
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

export type MakeRouteMatchFromRoute<TRoute extends AnyRoute> = RouteMatch<
  TRoute['types']['id'],
  TRoute['types']['fullPath'],
  TRoute['types']['allParams'],
  TRoute['types']['fullSearchSchema'],
  TRoute['types']['loaderData'],
  TRoute['types']['allContext'],
  TRoute['types']['loaderDeps']
>

export interface RouteMatch<
  out TRouteId,
  out TFullPath,
  out TAllParams,
  out TFullSearchSchema,
  out TLoaderData,
  out TAllContext,
  out TLoaderDeps,
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
  meta?: Array<React.JSX.IntrinsicElements['meta'] | undefined>
  links?: Array<React.JSX.IntrinsicElements['link'] | undefined>
  scripts?: Array<React.JSX.IntrinsicElements['script'] | undefined>
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
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = ToSubOptionsProps<TRouter, TFrom, TTo> &
  DeepPartial<MakeOptionalSearchParams<TRouter, TFrom, TTo>> &
  DeepPartial<MakeOptionalPathParams<TRouter, TFrom, TTo>> &
  MaskOptions<TRouter, TMaskFrom, TMaskTo> &
  MatchRouteOptions

export function useMatchRoute<TRouter extends AnyRouter = RegisteredRouter>() {
  const router = useRouter()

  useRouterState({
    select: (s) => [s.location.href, s.resolvedLocation.href, s.status],
    structuralSharing: true as any,
  })

  return React.useCallback(
    <
      const TFrom extends string = string,
      const TTo extends string | undefined = undefined,
      const TMaskFrom extends string = TFrom,
      const TMaskTo extends string = '',
    >(
      opts: UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
    ): false | ResolveRoute<TRouter, TFrom, TTo>['types']['allParams'] => {
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
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
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
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: MakeMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): any {
  const matchRoute = useMatchRoute()
  const params = matchRoute(props as any) as boolean

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

export interface UseMatchesBaseOptions<
  TRouter extends AnyRouter,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    matches: Array<MakeRouteMatchUnion<TRouter>>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
}

export type UseMatchesResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected ? Array<MakeRouteMatchUnion<TRouter>> : TSelected

export function useMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  return useRouterState({
    select: (state: RouterState<TRouter['routeTree']>) => {
      const matches = state.matches
      return opts?.select
        ? opts.select(matches as Array<MakeRouteMatchUnion<TRouter>>)
        : matches
    },
    structuralSharing: opts?.structuralSharing,
  } as any) as UseMatchesResult<TRouter, TSelected>
}

export function useParentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  const contextMatchId = React.useContext(matchContext)

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      matches = matches.slice(
        0,
        matches.findIndex((d) => d.id === contextMatchId),
      )
      return opts?.select ? opts.select(matches) : matches
    },
    structuralSharing: opts?.structuralSharing,
  } as any)
}

export function useChildMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  const contextMatchId = React.useContext(matchContext)

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      matches = matches.slice(
        matches.findIndex((d) => d.id === contextMatchId) + 1,
      )
      return opts?.select ? opts.select(matches) : matches
    },
    structuralSharing: opts?.structuralSharing,
  } as any)
}
