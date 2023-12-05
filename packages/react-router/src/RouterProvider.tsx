import * as React from 'react'
import warning from 'tiny-warning'
import { Matches } from './Matches'
import {
  LinkInfo,
  LinkOptions,
  NavigateOptions,
  ResolveRelativePath,
  ToOptions,
} from './link'
import { ParsedLocation } from './location'
import { AnyRoute } from './route'
import { RouteById, RoutePaths } from './routeInfo'
import {
  BuildNextOptions,
  RegisteredRouter,
  Router,
  RouterOptions,
  RouterState,
} from './router'
import { NoInfer, PickAsRequired, useLayoutEffect } from './utils'
import { MatchRouteOptions } from './Matches'
import { RouteMatch } from './Matches'

export interface CommitLocationOptions {
  replace?: boolean
  resetScroll?: boolean
  startTransition?: boolean
}

export interface MatchLocation {
  to?: string | number | null
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
}

export type BuildLinkFn<TRouteTree extends AnyRoute> = <
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
>(
  dest: LinkOptions<TRouteTree, TFrom, TTo>,
) => LinkInfo

export type NavigateFn<TRouteTree extends AnyRoute> = <
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
>(
  opts: NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
) => Promise<void>

export type MatchRouteFn<TRouteTree extends AnyRoute> = <
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TResolved = ResolveRelativePath<TFrom, NoInfer<TTo>>,
>(
  location: ToOptions<TRouteTree, TFrom, TTo>,
  opts?: MatchRouteOptions,
) => false | RouteById<TRouteTree, TResolved>['types']['allParams']

export type BuildLocationFn<TRouteTree extends AnyRoute> = (
  opts: BuildNextOptions,
) => ParsedLocation

export type InjectedHtmlEntry = string | (() => Promise<string> | string)

export const routerContext = React.createContext<Router<any>>(null!)

if (typeof document !== 'undefined') {
  window.__TSR_ROUTER_CONTEXT__ = routerContext as any
}

export function RouterProvider<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouteTree, TDehydrated>) {
  // Allow the router to update options on the router instance
  router.update({
    ...router.options,
    ...rest,
    context: {
      ...router.options.context,
      ...rest?.context,
    },
  } as any)

  const inner = <RouterProviderInner<TRouteTree, TDehydrated> router={router} />

  if (router.options.Wrap) {
    return <router.options.Wrap>{inner}</router.options.Wrap>
  }

  return inner
}

function RouterProviderInner<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router }: RouterProps<TRouteTree, TDehydrated>) {
  const [preState, setState] = React.useState(() => router.state)
  const [isTransitioning, startReactTransition] = React.useTransition()
  const isAnyTransitioning =
    isTransitioning || preState.matches.some((d) => d.status === 'pending')

  const state = React.useMemo<RouterState<TRouteTree>>(
    () => ({
      ...preState,
      status: isAnyTransitioning ? 'pending' : 'idle',
      location: isTransitioning ? router.latestLocation : preState.location,
      pendingMatches: router.pendingMatches,
    }),
    [preState, isTransitioning],
  )

  router.setState = setState
  router.state = state
  router.startReactTransition = startReactTransition

  const tryLoad = () => {
    startReactTransition(() => {
      try {
        router.load()
      } catch (err) {
        console.error(err)
      }
    })
  }

  useLayoutEffect(() => {
    const unsub = router.history.subscribe(() => {
      router.latestLocation = router.parseLocation(router.latestLocation)
      if (state.location !== router.latestLocation) {
        tryLoad()
      }
    })

    const nextLocation = router.buildLocation({
      search: true,
      params: true,
      hash: true,
      state: true,
    })

    if (state.location.href !== nextLocation.href) {
      router.commitLocation({ ...nextLocation, replace: true })
    }

    return () => {
      unsub()
    }
  }, [router.history])

  useLayoutEffect(() => {
    if (!isTransitioning && state.resolvedLocation !== state.location) {
      router.emit({
        type: 'onResolved',
        fromLocation: state.resolvedLocation,
        toLocation: state.location,
        pathChanged: state.location!.href !== state.resolvedLocation?.href,
      })
      router.pendingMatches = []

      setState((s) => ({
        ...s,
        resolvedLocation: s.location,
      }))
    }
  })

  useLayoutEffect(() => {
    if (!window.__TSR_DEHYDRATED__) {
      tryLoad()
    }
  }, [])

  return (
    <routerContext.Provider value={router}>
      <Matches />
    </routerContext.Provider>
  )
}

export function getRouteMatch<TRouteTree extends AnyRoute>(
  state: RouterState<TRouteTree>,
  id: string,
): undefined | RouteMatch<TRouteTree> {
  return [...state.pendingMatches, ...state.matches].find((d) => d.id === id)
}

export function useRouterState<
  TSelected = RouterState<RegisteredRouter['routeTree']>,
>(opts?: {
  select: (state: RouterState<RegisteredRouter['routeTree']>) => TSelected
}): TSelected {
  const { state } = useRouter()
  // return useStore(router.__store, opts?.select as any)
  return opts?.select ? opts.select(state) : (state as any)
}

export type RouterProps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<RouterOptions<TRouteTree, TDehydrated>, 'context'> & {
  router: Router<TRouteTree>
  context?: Partial<RouterOptions<TRouteTree, TDehydrated>['context']>
}

export function useRouter<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
>(): Router<TRouteTree> {
  const resolvedContext =
    typeof document !== 'undefined'
      ? window.__TSR_ROUTER_CONTEXT__ || routerContext
      : routerContext
  const value = React.useContext(resolvedContext)
  warning(value, 'useRouter must be used inside a <RouterProvider> component!')
  return value as any
}
