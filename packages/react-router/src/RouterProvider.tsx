import * as React from 'react'
import { Matches } from './Matches'
import { NavigateOptions, ToOptions } from './link'
import { ParsedLocation } from './location'
import { AnyRoute } from './route'
import { RoutePaths } from './routeInfo'
import { RegisteredRouter, Router, RouterOptions, RouterState } from './router'
import { pick, useLayoutEffect } from './utils'

import { RouteMatch } from './Matches'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { getRouterContext } from './routerContext'

const useTransition =
  React.useTransition ||
  (() => [
    false,
    (cb) => {
      cb()
    },
  ])

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

export type NavigateFn = <
  TTo extends string,
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
) => Promise<void>

export type BuildLocationFn<TRouteTree extends AnyRoute> = <
  TTo extends string,
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: ToOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
    leaveParams?: boolean
  },
) => ParsedLocation

export type InjectedHtmlEntry = string | (() => Promise<string> | string)

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

  const matches = router.options.InnerWrap ? (
    <router.options.InnerWrap>
      <Matches />
    </router.options.InnerWrap>
  ) : (
    <Matches />
  )

  const routerContext = getRouterContext()

  const provider = (
    <routerContext.Provider value={router}>
      {matches}
      <Transitioner />
    </routerContext.Provider>
  )

  if (router.options.Wrap) {
    return <router.options.Wrap>{provider}</router.options.Wrap>
  }

  return provider
}

function Transitioner() {
  const router = useRouter()
  const mountLoadForRouter = React.useRef({ router, mounted: false })
  const routerState = useRouterState({
    select: (s) =>
      pick(s, ['isLoading', 'location', 'resolvedLocation', 'isTransitioning']),
  })

  const [isTransitioning, startReactTransition] = useTransition()

  router.startReactTransition = startReactTransition

  React.useEffect(() => {
    if (isTransitioning) {
      router.__store.setState((s) => ({
        ...s,
        isTransitioning,
      }))
    }
  }, [isTransitioning])

  const tryLoad = () => {
    const apply = (cb: () => void) => {
      if (!routerState.isTransitioning) {
        startReactTransition(() => cb())
      } else {
        cb()
      }
    }

    apply(() => {
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
      if (router.state.location !== router.latestLocation) {
        tryLoad()
      }
    })

    return () => {
      unsub()
    }
  }, [router.history])

  useLayoutEffect(() => {
    if (
      (React.useTransition as any)
        ? routerState.isTransitioning && !isTransitioning
        : true &&
          !routerState.isLoading &&
          routerState.resolvedLocation !== routerState.location
    ) {
      router.emit({
        type: 'onResolved',
        fromLocation: routerState.resolvedLocation,
        toLocation: routerState.location,
        pathChanged:
          routerState.location!.href !== routerState.resolvedLocation?.href,
      })

      if ((document as any).querySelector) {
        if (routerState.location.hash !== '') {
          const el = document.getElementById(
            routerState.location.hash,
          ) as HTMLElement | null
          if (el) {
            el.scrollIntoView()
          }
        }
      }

      router.__store.setState((s) => ({
        ...s,
        isTransitioning: false,
        resolvedLocation: s.location,
      }))
    }
  }, [
    routerState.isTransitioning,
    isTransitioning,
    routerState.isLoading,
    routerState.resolvedLocation,
    routerState.location,
  ])

  useLayoutEffect(() => {
    if (
      window.__TSR_DEHYDRATED__ ||
      (mountLoadForRouter.current.router === router &&
        mountLoadForRouter.current.mounted)
    ) {
      return
    }
    mountLoadForRouter.current = { router, mounted: true }
    tryLoad()
  }, [router])

  return null
}

export function getRouteMatch<TRouteTree extends AnyRoute>(
  state: RouterState<TRouteTree>,
  id: string,
): undefined | RouteMatch<TRouteTree> {
  return [
    ...state.cachedMatches,
    ...(state.pendingMatches ?? []),
    ...state.matches,
  ].find((d) => d.id === id)
}

export type RouterProps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<RouterOptions<TRouteTree, TDehydrated>, 'context'> & {
  router: Router<TRouteTree>
  context?: Partial<RouterOptions<TRouteTree, TDehydrated>['context']>
}
