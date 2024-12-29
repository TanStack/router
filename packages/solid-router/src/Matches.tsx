import * as Solid from 'solid-js'
import warning from 'tiny-warning'
import { Transitioner } from './Transitioner'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { matchContext } from './matchContext'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { Match } from './Match'
import type { AnyRoute, StaticDataRouteOption } from './route'
import type { AnyRouter, RegisteredRouter, RouterState } from './router'
import type { ToOptions } from './link'
import type {
  ControlledPromise,
  DeepPartial,
  NoInfer,
  ParseRoute,
  ResolveRelativePath,
} from '@tanstack/router-core'
import type {
  AllContext,
  AllLoaderData,
  AllParams,
  FullSearchSchema,
  RouteById,
  RouteByPath,
  RouteIds,
  RoutePaths,
} from './routeInfo'

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

  const pendingElement = () =>
    router.options.defaultPendingComponent ? (
      <router.options.defaultPendingComponent />
    ) : null

  // Do not render a root Suspense during SSR or hydrating from SSR

  const inner = (
    <Solid.Suspense fallback={pendingElement()}>
      <Transitioner />
      <MatchesInner />
    </Solid.Suspense>
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
      const v = s.matches[0]?.id
      console.warn('MatchesInner matchId: ', v)
      return v
    },
  })

  const resetKey = useRouterState({
    select: (s) => s.loadedAt,
  })

  return (
    <matchContext.Provider value={matchId}>
      <CatchBoundary
        resetKey={resetKey()}
        errorComponent={ErrorComponent}
        onCatch={(error) => {
          warning(
            false,
            `The following error wasn't caught by any route! At the very least, consider setting an 'errorComponent' in your RootRoute!`,
          )
          warning(false, error.message || error.toString())
        }}
      >
        <Solid.Show when={matchId()}>
          {(matchId) => <Match matchId={matchId()} />}
        </Solid.Show>
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

  return <
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
  }
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
      ) => Solid.JSXElement)
    | Solid.JSXElement
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

export interface UseMatchesBaseOptions<TRouter extends AnyRouter, TSelected> {
  select?: (matches: Array<MakeRouteMatchUnion<TRouter>>) => TSelected
}

export type UseMatchesResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected ? Array<MakeRouteMatchUnion<TRouter>> : TSelected

export function useMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected>,
): UseMatchesResult<TRouter, TSelected> {
  return useRouterState({
    select: (state: RouterState<TRouter['routeTree']>) => {
      const matches = state.matches
      return opts?.select
        ? opts.select(matches as Array<MakeRouteMatchUnion<TRouter>>)
        : matches
    },
  } as any) as UseMatchesResult<TRouter, TSelected>
}

export function useParentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected>,
): UseMatchesResult<TRouter, TSelected> {
  const contextMatchId = Solid.useContext(matchContext)

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      matches = matches.slice(
        0,
        matches.findIndex((d) => d.id === contextMatchId()),
      )
      return opts?.select ? opts.select(matches) : matches
    },
  } as any)
}

export function useChildMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected>,
): UseMatchesResult<TRouter, TSelected> {
  const contextMatchId = Solid.useContext(matchContext)

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      matches = matches.slice(
        matches.findIndex((d) => d.id === contextMatchId()) + 1,
      )
      return opts?.select ? opts.select(matches) : matches
    },
  } as any)
}
