import * as React from 'react'

import { useSyncExternalStore } from 'use-sync-external-store/shim'

import type { Router } from '@tanstack/router-core'
import {
  warning,
  RouterOptions,
  RouteMatch,
  MatchLocation,
  MatchRouteOptions,
  RouteConfig,
  AnyPathParams,
  AnyRouteConfig,
  AnyAllRouteInfo,
  DefaultAllRouteInfo,
  functionalUpdate,
  BuildNextOptions,
  createRouter,
  AnyRouteInfo,
  AllRouteInfo,
  RouteInfo,
  ValidFromPath,
  LinkOptions,
  RouteInfoByPath,
  ResolveRelativePath,
  NoInfer,
  ToOptions,
} from '@tanstack/router-core'

export * from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  interface FrameworkGenerics {
    Element: React.ReactNode
    AsyncElement: (opts: {
      params: Record<string, string>
    }) => Promise<React.ReactNode>
    SyncOrAsyncElement: React.ReactNode | FrameworkGenerics['AsyncElement']
  }

  interface Router<
    TRouteConfig extends AnyRouteConfig = RouteConfig,
    TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
  > {
    useRoute: <TId extends keyof TAllRouteInfo['routeInfoById']>(
      routeId: TId,
    ) => Route<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
    useMatch: <TId extends keyof TAllRouteInfo['routeInfoById']>(
      routeId: TId,
    ) => RouteMatch<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
  }

  interface Route<
    TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
    TRouteInfo extends AnyRouteInfo = RouteInfo,
  > {
    linkProps: <TTo extends string = '.'>(
      props: LinkPropsOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo> &
        React.AnchorHTMLAttributes<HTMLAnchorElement>,
    ) => React.AnchorHTMLAttributes<HTMLAnchorElement>
    Link: <TTo extends string = '.'>(
      props: LinkPropsOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo> &
        React.AnchorHTMLAttributes<HTMLAnchorElement> &
        Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
          // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
          children?:
            | React.ReactNode
            | ((state: { isActive: boolean }) => React.ReactNode)
        },
    ) => JSX.Element
    MatchRoute: <TTo extends string = '.'>(
      props: ToOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo> &
        MatchRouteOptions & {
          // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
          children?:
            | React.ReactNode
            | ((
                params: RouteInfoByPath<
                  TAllRouteInfo,
                  ResolveRelativePath<TRouteInfo['fullPath'], NoInfer<TTo>>
                >['allParams'],
              ) => React.ReactNode)
        },
    ) => JSX.Element
  }
}

type LinkPropsOptions<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo> = '/',
  TTo extends string = '.',
> = LinkOptions<TAllRouteInfo, TFrom, TTo> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
}

export type PromptProps = {
  message: string
  when?: boolean | any
  children?: React.ReactNode
}

//

const matchesContext = React.createContext<RouteMatch[]>(null!)
const routerContext = React.createContext<{ router: Router<any, any> }>(null!)

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)

const useLayoutEffect = isDOM ? React.useLayoutEffect : React.useEffect

export type MatchesProviderProps = {
  value: RouteMatch[]
  children: React.ReactNode
}

export function MatchesProvider(props: MatchesProviderProps) {
  return <matchesContext.Provider {...props} />
}

const useRouterSubscription = (router: Router) => {
  useSyncExternalStore(
    (cb) => router.subscribe(() => cb()),
    () => router.state,
  )
}

export function createReactRouter<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
>(opts: RouterOptions<TRouteConfig>): Router<TRouteConfig> {
  const coreRouter = createRouter<TRouteConfig>({
    ...opts,
    createRouter: (router) => {
      return {
        ...router,
        useRoute: (id) => {
          const route = router.getRoute(id)

          useRouterSubscription(router)

          return route as any
        },
        useMatch: (routeId) => {
          const runtimeMatch = useMatch()
          const match = router.state.matches.find((d) => d.route.id === routeId)

          if (runtimeMatch !== match) {
            throw new Error(
              `useMatch('${
                routeId as string
              }') is being called in a component that is meant to render the '${
                runtimeMatch.id
              }' route. Did you mean to 'useRoute(${
                routeId as string
              })' instead?`,
            )
          }

          useRouterSubscription(router)

          if (!match) {
            throw new Error('Match not found!')
          }

          return match as any
        },
      }
    },
    createRoute: ({ router, route }) => {
      return {
        ...route,
        linkProps: (options) => {
          const {
            // custom props
            type,
            children,
            target,
            activeProps = () => ({ className: 'active' }),
            inactiveProps = () => ({}),
            activeOptions,
            disabled,
            // fromCurrent,
            hash,
            search,
            params,
            to,
            preload,
            preloadDelay,
            preloadMaxAge,
            replace,
            // element props
            style,
            className,
            onClick,
            onFocus,
            onMouseEnter,
            onMouseLeave,
            onTouchStart,
            onTouchEnd,
            ...rest
          } = options

          const linkInfo = route.buildLink(options)

          if (linkInfo.type === 'external') {
            const { href } = linkInfo
            return { href }
          }

          const {
            handleClick,
            handleFocus,
            handleEnter,
            handleLeave,
            isActive,
            next,
          } = linkInfo

          const composeHandlers =
            (handlers: (undefined | ((e: any) => void))[]) =>
            (e: React.SyntheticEvent) => {
              e.persist()
              handlers.forEach((handler) => {
                if (handler) handler(e)
              })
            }

          // Get the active props
          const resolvedActiveProps: React.HTMLAttributes<HTMLAnchorElement> =
            isActive ? functionalUpdate(activeProps) ?? {} : {}

          // Get the inactive props
          const resolvedInactiveProps: React.HTMLAttributes<HTMLAnchorElement> =
            isActive ? {} : functionalUpdate(inactiveProps) ?? {}

          return {
            ...resolvedActiveProps,
            ...resolvedInactiveProps,
            ...rest,
            href: disabled ? undefined : next.href,
            onClick: composeHandlers([handleClick, onClick]),
            onFocus: composeHandlers([handleFocus, onFocus]),
            onMouseEnter: composeHandlers([handleEnter, onMouseEnter]),
            onMouseLeave: composeHandlers([handleLeave, onMouseLeave]),
            target,
            style: {
              ...style,
              ...resolvedActiveProps.style,
              ...resolvedInactiveProps.style,
            },
            className:
              [
                className,
                resolvedActiveProps.className,
                resolvedInactiveProps.className,
              ]
                .filter(Boolean)
                .join(' ') || undefined,
            ...(disabled
              ? {
                  role: 'link',
                  'aria-disabled': true,
                }
              : undefined),
            ['data-status']: isActive ? 'active' : undefined,
          }
        },
        Link: React.forwardRef((props, ref) => {
          const linkProps = route.linkProps(props)

          useRouterSubscription(router)

          return (
            <a
              {...{
                ref: ref as any,
                ...linkProps,
                children:
                  typeof props.children === 'function'
                    ? props.children({
                        isActive:
                          (linkProps as any)['data-status'] === 'active',
                      })
                    : props.children,
              }}
            />
          )
        }),
        MatchRoute: (opts) => {
          const { pending, caseSensitive, children, ...rest } = opts

          const params = route.matchRoute(rest as any, {
            pending,
            caseSensitive,
          })

          // useRouterSubscription(router)

          if (!params) {
            return null
          }

          return typeof opts.children === 'function'
            ? opts.children(params as any)
            : opts.children
        },
      }
    },
  })

  return coreRouter
}

export type RouterProps<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
> = RouterOptions<TRouteConfig> & {
  router: Router<TRouteConfig, TAllRouteInfo>
  // Children will default to `<Outlet />` if not provided
  children?: React.ReactNode
}

export function RouterProvider<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
>({ children, router, ...rest }: RouterProps<TRouteConfig, TAllRouteInfo>) {
  router.update(rest)

  useSyncExternalStore(
    (cb) => router.subscribe(() => cb()),
    () => router.state,
  )

  useLayoutEffect(() => {
    router.mount()
  }, [])

  return (
    <routerContext.Provider value={{ router }}>
      <MatchesProvider value={router.state.matches}>
        {children ?? <Outlet />}
      </MatchesProvider>
    </routerContext.Provider>
  )
}

export function useRouter(): Router {
  const value = React.useContext(routerContext)
  warning(!value, 'useRouter must be used inside a <Router> component!')

  useRouterSubscription(value.router)

  return value.router as Router
}

// function useLatestCallback<TCallback extends (...args: any[]) => any>(
//   cb: TCallback,
// ) {
//   const cbRef = React.useRef<TCallback>(cb)
//   cbRef.current = cb
//   return React.useCallback(
//     (...args: Parameters<TCallback>): ReturnType<TCallback> =>
//       cbRef.current(...args),
//     [],
//   )
// }

export function useMatches(): RouteMatch[] {
  return React.useContext(matchesContext)
}

// export function useParentMatches(): RouteMatch[] {
//   const router = useRouter()
//   const match = useMatch()
//   const matches = router.state.matches
//   return matches.slice(0, matches.findIndex((d) => d.id === match.id) - 1)
// }

export function useMatch<T>(): RouteMatch {
  return useMatches()?.[0] as RouteMatch
}

// export function useAction<
//   TPayload = unknown,
//   TResponse = unknown,
//   TError = unknown,
// >(opts?: Pick<BuildNextOptions, 'to' | 'from'>) {
//   const match = useMatch()
//   const router = useRouter()
//   return router.getAction<TPayload, TResponse>(
//     { from: match.pathname, to: '.', ...opts },
//     {
//       isActive: !opts?.to,
//     },
//   )
// }

// export function Form(props: React.HTMLProps<HTMLFormElement>) {
//   const action = useAction()

//   return (
//     <form
//       {...props}

//     >
//       {props.children}
//     </form>
//   )
// }

// export function useMatchRoute() {
//   const router = useRouter()
//   const match = useMatch()

//   return useLatestCallback(
//     (matchLocation: MatchLocation, opts?: MatchRouteOptions) => {
//       return router.matchRoute(
//         {
//           ...matchLocation,
//           from: match.pathname,
//         },
//         opts,
//       )
//     },
//   )
// }

// export type MatchRouteProps = MatchLocation &
//   MatchRouteOptions & {
//     children:
//       | React.ReactNode
//       | ((routeParams?: AnyPathParams) => React.ReactNode)
//   }

// export function MatchRoute(props: MatchRouteProps & LinkInfo): JSX.Element {
//   const { children, pending, caseSensitive, type, ...rest } = props

//   const router = useRouter()

//   if (type === 'external') {
//     return <></>
//   }

//   const { next } = props

//   router.matchRoute({}, { pending })

//   const matchRoute = useMatchRoute()
//   const match = matchRoute(rest, { pending, caseSensitive })

//   if (typeof children === 'function') {
//     return children(match as any) as JSX.Element
//   }

//   return (match ? children : null) as JSX.Element
// }

// export function useLoadRoute() {
//   const match = useMatch()
//   const router = useRouter()

//   return useLatestCallback(
//     async (navigateOpts: BuildNextOptions, loaderOpts: { maxAge: number }) =>
//       router.loadRoute({ ...navigateOpts, from: match.pathname }, loaderOpts),
//   )
// }

// export function useInvalidateRoute() {
//   const match = useMatch()
//   const router = useRouter()

//   return useLatestCallback(async (navigateOpts: MatchLocation = { to: '.' }) =>
//     router.invalidateRoute({ ...navigateOpts, from: match.pathname }),
//   )
// }

// export function useNavigate() {
//   const router = useRouter()
//   const match = useMatch()

//   return useLatestCallback((options: BuildNextOptions) =>
//     // @ts-ignore-next // TODO: fix this
//     router.navigate({ ...options, from: match.pathname }),
//   )
// }

// export function Navigate(options: BuildNextOptions) {
//   let navigate = useNavigate()

//   useLayoutEffect(() => {
//     navigate(options)
//   }, [navigate])

//   return null
// }

export function Outlet() {
  const router = useRouter()
  const [, ...matches] = useMatches()

  const childMatch = matches[0]

  if (!childMatch) return null

  const element = (((): React.ReactNode => {
    if (!childMatch) {
      return null
    }

    const errorElement =
      childMatch.errorElement ?? router.options.defaultErrorElement

    if (childMatch.status === 'error') {
      if (errorElement) {
        return errorElement as any
      }

      if (
        childMatch.route.options.useErrorBoundary ||
        router.options.useErrorBoundary
      ) {
        throw childMatch.error
      }

      return <DefaultCatchBoundary error={childMatch.error} />
    }

    if (childMatch.status === 'loading' || childMatch.status === 'idle') {
      if (childMatch.isPending) {
        const pendingElement =
          childMatch.pendingElement ?? router.options.defaultPendingElement

        if (childMatch.route.options.pendingMs || pendingElement) {
          return (pendingElement as any) ?? null
        }
      }

      return null
    }

    return (childMatch.element as any) ?? router.options.defaultElement
  })() as JSX.Element) ?? <Outlet />

  const catchElement =
    childMatch?.route.options.catchElement ?? router.options.defaultCatchElement

  return (
    <MatchesProvider value={matches}>
      <CatchBoundary catchElement={catchElement}>{element}</CatchBoundary>
    </MatchesProvider>
  )
}

// export function useResolvePath() {
//   const router = useRouter()
//   const match = useMatch()
//   return useLatestCallback((path: string) =>
//     router.resolvePath(match.pathname, path),
//   )
// }

class CatchBoundary extends React.Component<{
  children: any
  catchElement: any
}> {
  state = {
    error: false,
  }
  componentDidCatch(error: any, info: any) {
    console.error(error)

    this.setState({
      error,
      info,
    })
  }
  reset = () => {
    this.setState({
      error: false,
      info: false,
    })
  }
  render() {
    const catchElement = this.props.catchElement ?? DefaultCatchBoundary

    if (this.state.error) {
      return typeof catchElement === 'function'
        ? catchElement(this.state)
        : catchElement
    }

    return this.props.children
  }
}

export function DefaultCatchBoundary({ error }: { error: any }) {
  return (
    <div style={{ padding: '.5rem', maxWidth: '100%' }}>
      <strong style={{ fontSize: '1.2rem' }}>Something went wrong!</strong>
      <div style={{ height: '.5rem' }} />
      <div>
        <pre>
          {error.message ? (
            <code
              style={{
                fontSize: '.7em',
                border: '1px solid red',
                borderRadius: '.25rem',
                padding: '.5rem',
                color: 'red',
              }}
            >
              {error.message}
            </code>
          ) : null}
        </pre>
      </div>
      <div style={{ height: '1rem' }} />
      <div
        style={{
          fontSize: '.8em',
          borderLeft: '3px solid rgba(127, 127, 127, 1)',
          paddingLeft: '.5rem',
          opacity: 0.5,
        }}
      >
        If you are the owner of this website, it's highly recommended that you
        configure your own custom Catch/Error boundaries for the router. You can
        optionally configure a boundary for each route.
      </div>
    </div>
  )
}
