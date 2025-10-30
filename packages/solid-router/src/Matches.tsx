import * as Solid from 'solid-js'
import warning from 'tiny-warning'
import { rootRouteId } from '@tanstack/router-core'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Transitioner } from './Transitioner'
import { matchContext } from './matchContext'
import { MatchAccessorContext } from './matchAccessorContext'
import { SafeFragment } from './SafeFragment'
import { Match } from './Match'
import type {
  AnyRoute,
  AnyRouteMatch,
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

// Similar to @solidjs/router's RouteContext
type MatchContextState = {
  matchId: string
  outlet: () => any
  // Provide stable accessor to match data, isolated in createRoot scope
  getMatchData: () => AnyRouteMatch | undefined
}

// Context to provide the stable match context state
const matchContextStateContext = Solid.createContext<
  Solid.Accessor<MatchContextState | undefined>
>()

// Hook to access the stable match context state
export function useMatchContextState() {
  return Solid.useContext(matchContextStateContext)
}

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

  const matches = useRouterState({
    select: (s) => s.matches,
  })

  const resetKey = useRouterState({
    select: (s) => s.loadedAt,
  })

  // Track disposers for each match context, similar to @solidjs/router
  const disposers: Array<() => void> = []

  // Create stable match contexts with createRoot, reusing them when possible
  // This is the key pattern from @solidjs/router's Routes component
  const matchContextStates = Solid.createMemo(
    Solid.on(
      matches,
      (nextMatches, prevMatches, prevContexts: MatchContextState[] | undefined) => {
        let equal = prevMatches && nextMatches.length === prevMatches.length
        const nextContexts: MatchContextState[] = []

        for (let i = 0, len = nextMatches.length; i < len; i++) {
          const prevMatch = prevMatches && prevMatches[i]
          const nextMatch = nextMatches[i]

          // Reuse the previous context if the match ID is the same
          if (prevContexts && prevMatch && nextMatch && nextMatch.id === prevMatch.id) {
            nextContexts[i] = prevContexts[i]!
          } else {
            equal = false
            // Dispose the old context
            if (disposers[i]) {
              disposers[i]!()
            }

            // Create new context in its own reactive scope
            Solid.createRoot((dispose) => {
              disposers[i] = dispose

              // Create stable accessor to match data inside this isolated scope
              // This prevents stale value access during async transitions
              const getMatchData = Solid.createMemo(() => {
                const currentMatches = router.state.matches
                let match = currentMatches.find((m) => m.id === nextMatch!.id)

                // Fallback to cachedMatches during transitions
                if (!match) {
                  match = router.state.cachedMatches.find((m) => m.id === nextMatch!.id)
                }

                return match
              })

              nextContexts[i] = {
                matchId: nextMatch!.id,
                outlet: createOutlet(() => matchContextStates()[i + 1]),
                getMatchData,
              }
            })
          }
        }

        // Dispose any extra contexts that are no longer needed
        disposers.splice(nextMatches.length).forEach((dispose) => dispose())

        // If nothing changed, reuse the entire previous array
        if (prevContexts && equal) {
          return prevContexts
        }

        return nextContexts
      },
    ),
  )

  const matchComponent = () => {
    const states = matchContextStates()
    const rootMatchContext = states[0]
    return (
      <Solid.Show when={rootMatchContext}>
        {(ctx) => (
          <matchContextStateContext.Provider value={() => ctx()}>
            <Match matchId={ctx().matchId} />
          </matchContextStateContext.Provider>
        )}
      </Solid.Show>
    )
  }

  return (
    <matchContext.Provider value={() => matchContextStates()[0]?.matchId}>
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

// Create outlet similar to @solidjs/router's createOutlet
const createOutlet = (child: () => MatchContextState | undefined) => {
  return () => (
    <Solid.Show when={child()} keyed>
      {(childCtx) => (
        <matchContext.Provider value={() => childCtx.matchId}>
          <matchContextStateContext.Provider value={() => childCtx}>
            <Match matchId={childCtx.matchId} />
          </matchContextStateContext.Provider>
        </matchContext.Provider>
      )}
    </Solid.Show>
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
