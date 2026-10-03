import * as Solid from 'solid-js'
import { replaceEqualDeep, rootRouteId } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter, useRouterContext } from './useRouter'
import { Rendered, Transitioner } from './Transitioner'
import { SafeFragment } from './SafeFragment'
import { Match } from './Match'
import { renderInNonRouteComponentContext } from './nonRouteComponentContext'
import type {
  AnyRoute,
  AnyRouter,
  DeepPartial,
  Expand,
  MakeOptionalPathParams,
  MakeOptionalSearchParams,
  MakeRouteMatchUnion,
  MaskOptions,
  MatchRouteOptions,
  RegisteredRouter,
  ResolveRoute,
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
    (isServer ?? router.isServer) ||
    (typeof document !== 'undefined' && router.ssr)
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
        fallback={
          PendingComponent
            ? (() => {
                if (process.env.NODE_ENV !== 'production') {
                  return renderInNonRouteComponentContext(
                    () => <PendingComponent />,
                    'pendingComponent',
                  )
                }
                return <PendingComponent />
              })()
            : null
        }
      >
        <Transitioner />
        <MatchesInner />
        <Rendered />
      </ResolvedSuspense>
    </OptionalWrapper>
  )
}

function MatchesInner() {
  const router = useRouter()
  const routeId = () => router.stores.ids.get()[0]
  const match = () =>
    routeId() ? router.stores.byRoute.get(routeId()!)?.get() : undefined

  const matchComponent = () => {
    return (
      <Solid.Show when={routeId()}>
        <Match routeId={routeId()!} />
      </Solid.Show>
    )
  }

  return router.options.disableGlobalCatchBoundary ? (
    matchComponent()
  ) : (
    <CatchBoundary
      getResetKey={match}
      errorComponent={ErrorComponent}
      onCatch={
        process.env.NODE_ENV !== 'production'
          ? (error) => {
              console.warn(
                `Warning: The following error wasn't caught by any route! At the very least, consider setting an 'errorComponent' in your RootRoute!`,
              )
              console.warn(`Warning: ${error.message || error.toString()}`)
            }
          : undefined
      }
    >
      {matchComponent()}
    </CatchBoundary>
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
    const select = () => {
      const { pending, caseSensitive, fuzzy, includeSearch, ...rest } = opts

      router.stores.location.get()
      router.stores.resolvedLocation.get()
      router.stores.status.get()
      return router.matchRoute(rest as any, {
        pending,
        caseSensitive,
        fuzzy,
        includeSearch,
      })
    }
    if (isServer ?? router.isServer) {
      const selected = select()
      return () => selected
    }
    return Solid.createMemo(select)
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
        params?: Expand<
          ResolveRoute<TRouter, TFrom, TTo>['types']['allParams']
        >,
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
  const matchRoute = useMatchRoute()
  const params = matchRoute(props as any)

  const renderChild = () => {
    const matchedParams = params()
    const child = props.children

    if (typeof child === 'function') {
      return (child as any)(matchedParams)
    }

    return matchedParams ? child : null
  }
  if (isServer ?? useRouter().isServer) {
    return <>{renderChild()}</>
  }
  const renderedChild = Solid.createMemo(renderChild)
  return <>{renderedChild()}</>
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
  const router = useRouter<TRouter>()
  if (isServer ?? router.isServer) {
    const matches = router.stores.matches.get() as Array<
      MakeRouteMatchUnion<TRouter>
    >
    const selected = opts?.select ? opts.select(matches) : matches
    return (() => selected) as Solid.Accessor<
      UseMatchesResult<TRouter, TSelected>
    >
  }
  return Solid.createMemo((prev: TSelected | undefined) => {
    const matches = router.stores.matches.get() as Array<
      MakeRouteMatchUnion<TRouter>
    >
    const res = opts?.select ? opts.select(matches) : matches
    if (prev === undefined) {
      return res
    }
    return replaceEqualDeep(prev, res) as any
  }) as Solid.Accessor<UseMatchesResult<TRouter, TSelected>>
}

export function useParentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected>,
): Solid.Accessor<UseMatchesResult<TRouter, TSelected>> {
  const contextRouteId = useRouterContext()?.[2 /* route id */]

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      matches = matches.slice(
        0,
        matches.findIndex((d) => d.routeId === contextRouteId),
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
  const contextRouteId = useRouterContext()?.[2 /* route id */]

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      matches = matches.slice(
        matches.findIndex((d) => d.routeId === contextRouteId) + 1,
      )
      return opts?.select ? opts.select(matches) : matches
    },
  } as any)
}
