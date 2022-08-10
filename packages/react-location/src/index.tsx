import * as React from 'react'

import { useSyncExternalStore } from 'use-sync-external-store/shim'

import {
  warning,
  LocationManager,
  RouterInstance,
  RouterOptions,
  RouteMatch,
  RouteParams,
  NavigateOptions,
  MatchLocation,
  MatchRouteOptions,
  LinkOptions,
} from '@tanstack/location-core'

export * from '@tanstack/location-core'

declare module '@tanstack/location-core' {
  interface FrameworkGenerics<TData = unknown> {
    Element: React.ReactNode
    AsyncElement: (opts: {
      params: Record<string, string>
    }) => Promise<React.ReactNode>
    SyncOrAsyncElement:
      | React.ReactNode
      | FrameworkGenerics<TData>['AsyncElement']
    LinkProps: React.HTMLAttributes<unknown>
  }
}

export type PromptProps = {
  message: string
  when?: boolean | any
  children?: React.ReactNode
}

//

const matchesContext = React.createContext<RouteMatch<unknown>[]>(null!)
const routerContext = React.createContext<{ router: RouterInstance }>(null!)

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)

const useLayoutEffect = isDOM ? React.useLayoutEffect : React.useEffect

export type MatchesProviderProps = {
  value: RouteMatch<unknown>[]
  children: React.ReactNode
}

export function MatchesProvider(props: MatchesProviderProps) {
  return <matchesContext.Provider {...props} />
}

export type RouterProps = {
  // Children will default to `<Outlet />` if not provided
  locationManager?: LocationManager
  children?: React.ReactNode
} & RouterOptions

export function Router({
  locationManager,
  __experimental__snapshot,
  children,
  ...rest
}: RouterProps) {
  const [router] = React.useState(() => {
    if (!locationManager) {
      locationManager = new LocationManager()
    }

    return new RouterInstance({
      locationManager,
      __experimental__snapshot,
    })
  })

  router.update(rest)

  useLayoutEffect(() => {
    router.mount()
  }, [])

  useSyncExternalStore(
    (cb) => router.subscribe(() => cb()),
    () => router.state,
  )

  return (
    <routerContext.Provider value={{ router }}>
      <MatchesProvider
        value={[
          router.rootMatch as RouteMatch<unknown>,
          ...router.state.current.matches,
        ]}
      >
        {children ?? <Outlet />}
      </MatchesProvider>
    </routerContext.Provider>
  )
}

export function useRouter(): RouterInstance {
  const value = React.useContext(routerContext)

  warning(value, 'useRouter must be used inside a <Router> component!')

  return value.router as RouterInstance
}

export function useLocationManager(): LocationManager {
  const router = useRouter()
  return router.locationManager
}

function useLatestCallback<TCallback extends (...args: any[]) => any>(
  cb: TCallback,
) {
  const cbRef = React.useRef<TCallback>(cb)

  cbRef.current = cb

  return React.useCallback(
    (...args: Parameters<TCallback>): ReturnType<TCallback> =>
      cbRef.current(...args),
    [],
  )
}

export function useMatches(): RouteMatch<unknown>[] {
  return React.useContext(matchesContext)
}

export function MatchRoute({
  children,
  pending,
  caseSensitive,
  ...rest
}: {
  children: React.ReactNode | ((routeParams?: RouteParams) => React.ReactNode)
} & MatchLocation &
  MatchRouteOptions): JSX.Element {
  const matchRoute = useMatchRoute()
  const match = matchRoute(rest, { pending, caseSensitive })

  if (typeof children === 'function') {
    return children(match as any) as JSX.Element
  }

  return (match ? children : null) as JSX.Element
}

export function useLoadRoute() {
  const match = useMatch()
  const router = useRouter()

  return useLatestCallback(
    async (navigateOpts: NavigateOptions, loaderOpts?: { maxAge?: number }) =>
      router.loadRoute({ ...navigateOpts, from: match.pathname }, loaderOpts),
  )
}

export function useParentMatches(): RouteMatch<unknown>[] {
  const router = useRouter()
  const match = useMatch()
  const matches = router.state.current.matches
  return matches.slice(0, matches.findIndex((d) => d.id === match.id) - 1)
}

export function useMatch<T>(): RouteMatch<T> {
  return useMatches()?.[0] as RouteMatch<T>
}

export function useNavigate() {
  const router = useRouter()
  const match = useMatch()

  return useLatestCallback((options: NavigateOptions) =>
    router.navigate({ ...options, from: match.pathname }),
  )
}

export function Navigate(options: NavigateOptions) {
  let navigate = useNavigate()

  useLayoutEffect(() => {
    navigate(options)
  }, [navigate])

  return null
}

export function Outlet() {
  const router = useRouter()
  const [_, ...matches] = useMatches()

  if (!matches.length) return null

  let element = router.getOutletElement(matches) ?? <Outlet />
  return <MatchesProvider value={matches}>{element}</MatchesProvider>
}

export function useResolvePath() {
  const router = useRouter()
  const match = useMatch()
  return useLatestCallback((path: string) => router.resolvePath(match, path))
}

export function useSearch() {
  const location = useLocationManager()
  return location.current.search
}

export function useMatchRoute() {
  const router = useRouter()
  const match = useMatch()

  return useLatestCallback(
    (matchLocation: MatchLocation, opts?: MatchRouteOptions) =>
      router.matchRoute(matchLocation, opts, match),
  )
}

export type LinkProps = LinkOptions &
  Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    'href' | 'children' | keyof LinkOptions
  > & {
    // A custom ref prop because of this: https://stackoverflow.com/questions/58469229/react-with-typescript-generics-while-using-react-forwardref/58473012
    _ref?: React.Ref<HTMLAnchorElement>
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean }) => React.ReactNode)
  }

export function useLink(opts: LinkOptions) {
  const router = useRouter()
  const match = useMatch()
  return router.buildLinkInfo({ ...opts, from: match.pathname })
}

export function Link(props: LinkProps) {
  const linkUtils = useLink(props)

  const {
    to,
    children,
    _ref,
    disabled,
    target,
    search,
    hash,
    replace,
    getActiveProps,
    getInactiveProps,
    activeOptions,
    preload,
    preloadMaxAge,
    style,
    className,
    ...rest
  } = props

  if (!linkUtils) {
    return (
      <a href={to as string} {...rest}>
        {typeof children === 'function'
          ? children({ isActive: false })
          : children}
      </a>
    )
  }

  const {
    next,
    activeProps,
    handleClick,
    handleMouseEnter,
    inactiveProps,
    isActive,
  } = linkUtils

  return (
    <a
      {...{
        ...activeProps,
        ...inactiveProps,
        ...rest,
        ref: _ref,
        href: disabled ? undefined : next.href,
        onClick: handleClick as any,
        onMouseEnter: handleMouseEnter as any,
        target,
        style: {
          ...style,
          ...activeProps.style,
          ...inactiveProps.style,
        },
        className:
          [className, activeProps.className, inactiveProps.className]
            .filter(Boolean)
            .join(' ') || undefined,
        ...(disabled
          ? {
              role: 'link',
              'aria-disabled': true,
            }
          : undefined),
        children:
          typeof children === 'function' ? children({ isActive }) : children,
      }}
    />
  )
}
