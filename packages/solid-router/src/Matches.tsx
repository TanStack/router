import * as Solid from 'solid-js'
import { replaceEqualDeep } from '@tanstack/router-core'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter } from './useRouter'
import { Rendered, Transitioner } from './Transitioner'
import { nearestMatchContext } from './matchContext'
import { SafeFragment } from './SafeFragment'
import { Match } from './Match'
import type {
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
import type { JSX } from '@solidjs/web'

const NearestMatchContext = nearestMatchContext as unknown as Solid.Component<{
  value: any
  children: any
}>

declare module '@tanstack/router-core' {
  export interface RouteMatchExtensions {
    meta?: Array<JSX.IntrinsicElements['meta'] | undefined>
    links?: Array<JSX.IntrinsicElements['link'] | undefined>
    scripts?: Array<JSX.IntrinsicElements['script'] | undefined>
    styles?: Array<JSX.IntrinsicElements['style'] | undefined>
    headScripts?: Array<JSX.IntrinsicElements['script'] | undefined>
  }
}

export function Matches() {
  const router = useRouter()

  const OptionalWrapper = router.options.InnerWrap || SafeFragment

  return (
    <OptionalWrapper>
      <Transitioner />
      <MatchesInner />
      <Rendered />
    </OptionalWrapper>
  )
}

function MatchesInner() {
  const router = useRouter()
  const routeId = () => router.stores.ids.get()[0]
  const match = () =>
    routeId() ? router.stores.byRoute.get(routeId()!)?.get() : undefined
  const nearestMatch = [routeId, match] as const

  const matchContent = () => (
    <Solid.Show when={routeId()} keyed>
      {(currentRouteId) => <Match routeId={currentRouteId} />}
    </Solid.Show>
  )

  if (router.options.disableGlobalCatchBoundary) {
    // When disableGlobalCatchBoundary is true, render without any internal
    // error boundary so errors bubble up freely to an external Errored boundary.
    return (
      <NearestMatchContext value={nearestMatch}>
        {matchContent()}
      </NearestMatchContext>
    )
  }

  return (
    <NearestMatchContext value={nearestMatch}>
      <CatchBoundary
        getResetKey={() => router.stores.matches.get()}
        render={matchContent}
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
      />
    </NearestMatchContext>
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
    return Solid.createMemo(() => {
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
    })
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
      ) => JSX.Element)
    | JSX.Element
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

  const renderedChild = Solid.createMemo(() => {
    const matchedParams = params()
    const child = props.children

    if (typeof child === 'function') {
      return (child as any)(matchedParams)
    }

    return matchedParams ? child : null
  })

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
  return Solid.createMemo((prev: TSelected | undefined) => {
    const matches = router.stores.matches.get() as Array<
      MakeRouteMatchUnion<TRouter>
    >
    const res = opts?.select ? opts.select(matches) : matches
    if (prev === undefined) return res
    return replaceEqualDeep(prev, res) as any
  }) as Solid.Accessor<UseMatchesResult<TRouter, TSelected>>
}

export function useParentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected>,
): Solid.Accessor<UseMatchesResult<TRouter, TSelected>> {
  const contextRouteId = Solid.useContext(nearestMatchContext)[0 /* route id */]

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      matches = matches.slice(
        0,
        matches.findIndex((d) => d.routeId === contextRouteId()),
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
  const contextRouteId = Solid.useContext(nearestMatchContext)[0 /* route id */]

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      matches = matches.slice(
        matches.findIndex((d) => d.routeId === contextRouteId()) + 1,
      )
      return opts?.select ? opts.select(matches) : matches
    },
  } as any)
}
