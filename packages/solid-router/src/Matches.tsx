import * as Solid from 'solid-js'
import warning from 'tiny-warning'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Transitioner } from './Transitioner'
import { matchContext } from './matchContext'
import { Match } from './Match'
import { SafeFragment } from './SafeFragment'
import type {
  AnyRouter,
  DeepPartial,
  Expand,
  MakeOptionalPathParams,
  MakeOptionalSearchParams,
  MakeRouteMatchUnion,
  MaskOptions,
  MatchRouteOptions,
  NoInfer,
  RegisteredRouter,
  ResolveRelativePath,
  ResolveRoute,
  RouteByPath,
  RouterState,
  ToSubOptionsProps,
} from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  export interface RouteMatchExtensions {
    meta?: Array<Solid.JSX.IntrinsicElements['meta'] | undefined>
    links?: Array<Solid.JSX.IntrinsicElements['link'] | undefined>
    scripts?: Array<Solid.JSX.IntrinsicElements['script'] | undefined>
    styles?: Array<Solid.JSX.IntrinsicElements['style'] | undefined>
    headScripts?: Array<Solid.JSX.IntrinsicElements['script'] | undefined>
  }
}

export function Matches() {
  const router = useRouter()

  const pendingElement = router.options.defaultPendingComponent ? (
    <router.options.defaultPendingComponent />
  ) : null

  // Do not render a root Suspense during SSR or hydrating from SSR
  const ResolvedSuspense =
    router.isServer || (typeof document !== 'undefined' && router.ssr)
      ? SafeFragment
      : Solid.Suspense

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
        getResetKey={() => resetKey()}
        errorComponent={ErrorComponent}
        onCatch={(error) => {
          warning(
            false,
            `The following error wasn't caught by any route! At the very least, consider setting an 'errorComponent' in your RootRoute!`,
          )
          warning(false, error.message || error.toString())
        }}
      >
        {matchId() ? <Match matchId={matchId()!} /> : null}
      </CatchBoundary>
    </matchContext.Provider>
  )
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

  const status = useRouterState({
    select: (s) => s.status,
  })

  return <
    const TFrom extends string = string,
    const TTo extends string | undefined = undefined,
    const TMaskFrom extends string = TFrom,
    const TMaskTo extends string = '',
  >(
    opts: UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  ): Solid.Accessor<
    false | Expand<ResolveRoute<TRouter, TFrom, TTo>['types']['allParams']>
  > => {
    const { pending, caseSensitive, fuzzy, includeSearch, ...rest } = opts

    const matchRoute = Solid.createMemo(() => {
      status()
      return router.matchRoute(rest as any, {
        pending,
        caseSensitive,
        fuzzy,
        includeSearch,
      })
    })

    return matchRoute
  }
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
      ) => Solid.JSX.Element)
    | Solid.JSX.Element
}

export function MatchRoute<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: MakeMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): any {
  const status = useRouterState({
    select: (s) => s.status,
  })

  return (
    <Solid.Show when={status()} keyed>
      {(_) => {
        const matchRoute = useMatchRoute()
        const params = matchRoute(props as any)() as boolean
        const child = props.children
        if (typeof child === 'function') {
          return (child as any)(params)
        }

        return params ? child : null
      }}
    </Solid.Show>
  )
}

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
): Solid.Accessor<UseMatchesResult<TRouter, TSelected>> {
  return useRouterState({
    select: (state: RouterState<TRouter['routeTree']>) => {
      const matches = state.matches
      return opts?.select
        ? opts.select(matches as Array<MakeRouteMatchUnion<TRouter>>)
        : matches
    },
  } as any) as Solid.Accessor<UseMatchesResult<TRouter, TSelected>>
}

export function useParentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected>,
): Solid.Accessor<UseMatchesResult<TRouter, TSelected>> {
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
): Solid.Accessor<UseMatchesResult<TRouter, TSelected>> {
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
