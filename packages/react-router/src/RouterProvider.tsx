import * as React from 'react'
import { flushSync } from 'react-dom'
import { Matches } from './Matches'
import { pick, useLayoutEffect } from './utils'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { getRouterContext } from './routerContext'
import type { NavigateOptions, ToOptions } from './link'
import type { ParsedLocation } from './location'
import type { AnyRoute } from './route'
import type { RoutePaths } from './routeInfo'
import type {
  AnyRouter,
  RegisteredRouter,
  Router,
  RouterOptions,
  RouterState,
} from './router'

import type { MakeRouteMatch } from './Matches'

export interface CommitLocationOptions {
  replace?: boolean
  resetScroll?: boolean
  viewTransition?: boolean
  /**
   * @deprecated All navigations use React transitions under the hood now
   **/
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
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => Promise<void>

export type BuildLocationFn<TRouteTree extends AnyRoute> = <
  TTo extends string,
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: ToOptions<
    Router<TRouteTree, 'never'>,
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  > & {
    leaveParams?: boolean
  },
) => ParsedLocation

export type InjectedHtmlEntry = string | (() => Promise<string> | string)

export function RouterProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouter, TDehydrated>) {
  // Allow the router to update options on the router instance
  router.update({
    ...router.options,
    ...rest,
    context: {
      ...router.options.context,
      ...rest.context,
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
    <React.Suspense fallback={null}>
      <routerContext.Provider value={router}>
        {matches}
        <Transitioner />
      </routerContext.Provider>
    </React.Suspense>
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

  const [isTransitioning, startReactTransition_] = React.useTransition()
  // Track pending state changes
  const hasPendingMatches = useRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
  })

  const previousIsLoading = usePrevious(routerState.isLoading)

  const isAnyPending =
    routerState.isLoading || isTransitioning || hasPendingMatches
  const previousIsAnyPending = usePrevious(isAnyPending)

  router.startReactTransition = startReactTransition_

  const tryLoad = () => {
    try {
      router.load()
    } catch (err) {
      console.error(err)
    }
  }

  // Subscribe to location changes
  // and try to load the new location
  useLayoutEffect(() => {
    const unsub = router.history.subscribe(() => {
      router.latestLocation = router.parseLocation(router.latestLocation)
      if (router.state.location !== router.latestLocation) {
        tryLoad()
      }
    })

    const nextLocation = router.buildLocation({
      to: router.latestLocation.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
    })

    if (routerState.location.href !== nextLocation.href) {
      router.commitLocation({ ...nextLocation, replace: true })
    }

    return () => {
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, router.history])

  // Try to load the initial location
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useLayoutEffect(() => {
    // The router was loading and now it's not
    if (previousIsLoading && !routerState.isLoading) {
      const toLocation = router.state.location
      const fromLocation = router.state.resolvedLocation
      const pathChanged = fromLocation.href !== toLocation.href

      router.emit({
        type: 'onLoad',
        fromLocation,
        toLocation,
        pathChanged,
      })

      // if (router.viewTransitionPromise) {
      //   console.log('resolving view transition promise')
      // }

      // router.viewTransitionPromise?.resolve(true)
    }
  }, [previousIsLoading, router, routerState.isLoading])

  useLayoutEffect(() => {
    // The router was pending and now it's not
    if (previousIsAnyPending && !isAnyPending) {
      const toLocation = router.state.location
      const fromLocation = router.state.resolvedLocation
      const pathChanged = fromLocation.href !== toLocation.href

      router.emit({
        type: 'onResolved',
        fromLocation,
        toLocation,
        pathChanged,
      })

      router.__store.setState((s) => ({
        ...s,
        status: 'idle',
        resolvedLocation: s.location,
      }))

      if ((document as any).querySelector) {
        if (router.state.location.hash !== '') {
          const el = document.getElementById(router.state.location.hash)
          if (el) {
            el.scrollIntoView()
          }
        }
      }
    }
  }, [isAnyPending, previousIsAnyPending, router])

  return null
}

export function getRouteMatch<TRouteTree extends AnyRoute>(
  state: RouterState<TRouteTree>,
  id: string,
): undefined | MakeRouteMatch<TRouteTree> {
  return [
    ...state.cachedMatches,
    ...(state.pendingMatches ?? []),
    ...state.matches,
  ].find((d) => d.id === id)
}

export type RouterProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<
  RouterOptions<
    TRouter['routeTree'],
    NonNullable<TRouter['options']['trailingSlash']>,
    TDehydrated
  >,
  'context'
> & {
  router: Router<
    TRouter['routeTree'],
    NonNullable<TRouter['options']['trailingSlash']>
  >
  context?: Partial<
    RouterOptions<
      TRouter['routeTree'],
      NonNullable<TRouter['options']['trailingSlash']>,
      TDehydrated
    >['context']
  >
}

function usePrevious<T>(value: T) {
  const ref = React.useRef<T>(value)
  React.useEffect(() => {
    ref.current = value
  })
  return ref.current
}
