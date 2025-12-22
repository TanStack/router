import * as Solid from 'solid-js'
import warning from 'tiny-warning'
import { rootRouteId } from '@tanstack/router-core'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Transitioner } from './Transitioner'
import { matchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { Match } from './Match'
import type {
  AnyRoute,
  DeepPartial,
  Expand,
  MakeOptionalPathParams,
  MakeOptionalSearchParams,
  MakeRouteMatchUnion,
  MaskOptions,
  MatchRouteOptions,
  NoInfer,
  Register,
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

  const ResolvedSuspense =
    router.isServer || (typeof document !== 'undefined' && router.ssr)
      ? SafeFragment
      : Solid.Suspense

  const rootRoute: () => AnyRoute = () => router.routesById[rootRouteId]
  const PendingComponent =
    rootRoute().options.pendingComponent ??
    router.options.defaultPendingComponent

  const OptionalWrapper = router.options.InnerWrap || SafeFragment

  return (
    <OptionalWrapper>
      <ResolvedSuspense
        fallback={PendingComponent ? <PendingComponent /> : null}
      >
        <Transitioner />
        <MatchesInner />
      </ResolvedSuspense>
    </OptionalWrapper>
  )
}

function MatchesInner() {
  const router = useRouter()
  const matchId = useRouterState({
    select: (s) => {
      return s.matches[0]?.id
    },
  })

  const resetKey = useRouterState({
    select: (s) => s.loadedAt,
  })

  const matchComponent = () => {
    return (
      <Solid.Show when={matchId()}>
        <Match matchId={matchId()!} />
      </Solid.Show>
    )
  }

  return (
    <matchContext.Provider value={matchId}>
      {router.options.disableGlobalCatchBoundary ? (
        matchComponent()
      ) : (
        <CatchBoundary
          getResetKey={() => resetKey()}
          errorComponent={ErrorComponent}
          onCatch={(error) => {
            warning(
              false,
              `The following error wasn't caught by any route! At the very leas
    t, consider setting an 'errorComponent' in your RootRoute!`,
            )
            warning(false, error.message || error.toString())
          }}
        >
          {matchComponent()}
        </CatchBoundary>
      )}
    </matchContext.Provider>
  )
}

export type UseMatchRouteOptions<
  TRegister extends Register = Register,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = ToSubOptionsProps<RegisteredRouter<TRegister>, TFrom, TTo> &
  DeepPartial<
    MakeOptionalSearchParams<RegisteredRouter<TRegister>, TFrom, TTo>
  > &
  DeepPartial<MakeOptionalPathParams<RegisteredRouter<TRegister>, TFrom, TTo>> &
  MaskOptions<RegisteredRouter<TRegister>, TMaskFrom, TMaskTo> &
  MatchRouteOptions

export function useMatchRoute<TRegister extends Register = Register>() {
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
    opts: UseMatchRouteOptions<TRegister, TFrom, TTo, TMaskFrom, TMaskTo>,
  ): Solid.Accessor<
    | false
    | Expand<
        ResolveRoute<
          RegisteredRouter<TRegister>,
          TFrom,
          TTo
        >['types']['allParams']
      >
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
  TRegister extends Register = Register,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = UseMatchRouteOptions<TRegister, TFrom, TTo, TMaskFrom, TMaskTo> & {
  // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
  children?:
    | ((
        params?: RouteByPath<
          RegisteredRouter<TRegister>['routeTree'],
          ResolveRelativePath<TFrom, NoInfer<TTo>>
        >['types']['allParams'],
      ) => Solid.JSX.Element)
    | Solid.JSX.Element
}

export function MatchRoute<
  TRegister extends Register = Register,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: MakeMatchRouteOptions<TRegister, TFrom, TTo, TMaskFrom, TMaskTo>,
): any {
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

export interface UseMatchesBaseOptions<TRegister extends Register, TSelected> {
  select?: (
    matches: Array<MakeRouteMatchUnion<RegisteredRouter<TRegister>>>,
  ) => TSelected
}

export type UseMatchesResult<
  TRegister extends Register,
  TSelected,
> = unknown extends TSelected
  ? Array<MakeRouteMatchUnion<RegisteredRouter<TRegister>>>
  : TSelected

export function useMatches<
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseMatchesBaseOptions<TRegister, TSelected>,
): Solid.Accessor<UseMatchesResult<TRegister, TSelected>> {
  return useRouterState({
    select: (state: RouterState<RegisteredRouter<TRegister>['routeTree']>) => {
      const matches = state.matches
      return opts?.select
        ? opts.select(
            matches as Array<MakeRouteMatchUnion<RegisteredRouter<TRegister>>>,
          )
        : matches
    },
  } as any) as Solid.Accessor<UseMatchesResult<TRegister, TSelected>>
}

export function useParentMatches<
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseMatchesBaseOptions<TRegister, TSelected>,
): Solid.Accessor<UseMatchesResult<TRegister, TSelected>> {
  const contextMatchId = Solid.useContext(matchContext)

  return useMatches({
    select: (
      matches: Array<MakeRouteMatchUnion<RegisteredRouter<TRegister>>>,
    ) => {
      matches = matches.slice(
        0,
        matches.findIndex((d) => d.id === contextMatchId()),
      )
      return opts?.select ? opts.select(matches) : matches
    },
  } as any)
}

export function useChildMatches<
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseMatchesBaseOptions<TRegister, TSelected>,
): Solid.Accessor<UseMatchesResult<TRegister, TSelected>> {
  const contextMatchId = Solid.useContext(matchContext)

  return useMatches({
    select: (
      matches: Array<MakeRouteMatchUnion<RegisteredRouter<TRegister>>>,
    ) => {
      matches = matches.slice(
        matches.findIndex((d) => d.id === contextMatchId()) + 1,
      )
      return opts?.select ? opts.select(matches) : matches
    },
  } as any)
}
