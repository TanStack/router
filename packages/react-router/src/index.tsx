import * as React from 'react'

import { useSyncExternalStore } from 'use-sync-external-store/shim'

import {
  AnyRoute,
  CheckId,
  rootRouteId,
  Router,
  RouterState,
  ToIdOption,
} from '@tanstack/router-core'
import {
  warning,
  RouterOptions,
  RouteMatch,
  MatchRouteOptions,
  RouteConfig,
  AnyRouteConfig,
  AnyAllRouteInfo,
  DefaultAllRouteInfo,
  functionalUpdate,
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
  invariant,
} from '@tanstack/router-core'

export * from '@tanstack/router-core'

export { lazyWithPreload as lazy } from 'react-lazy-with-preload/lib/index'
export type { PreloadableComponent as LazyComponent } from 'react-lazy-with-preload'

type SyncRouteComponent = (props?: {}) => React.ReactNode
export type RouteComponent = SyncRouteComponent & {
  preload?: () => Promise<{
    default: SyncRouteComponent
  }>
}

declare module '@tanstack/router-core' {
  interface FrameworkGenerics {
    Component: RouteComponent
  }

  interface Router<
    TRouteConfig extends AnyRouteConfig = RouteConfig,
    TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
  > {
    useState: () => RouterState
    useRoute: <TId extends keyof TAllRouteInfo['routeInfoById']>(
      routeId: TId,
    ) => Route<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
    useMatch: <
      TId extends keyof TAllRouteInfo['routeInfoById'],
      TStrict extends true | false = true,
    >(
      routeId: TId,
      opts?: { strict?: TStrict },
    ) => TStrict extends true
      ? RouteMatch<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
      :
          | RouteMatch<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
          | undefined
    linkProps: <TTo extends string = '.'>(
      props: LinkPropsOptions<TAllRouteInfo, '/', TTo> &
        React.AnchorHTMLAttributes<HTMLAnchorElement>,
    ) => React.AnchorHTMLAttributes<HTMLAnchorElement>
    Link: <TTo extends string = '.'>(
      props: LinkPropsOptions<TAllRouteInfo, '/', TTo> &
        React.AnchorHTMLAttributes<HTMLAnchorElement> &
        Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
          // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
          children?:
            | React.ReactNode
            | ((state: { isActive: boolean }) => React.ReactNode)
        },
    ) => JSX.Element
    MatchRoute: <TTo extends string = '.'>(
      props: ToOptions<TAllRouteInfo, '/', TTo> &
        MatchRouteOptions & {
          // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
          children?:
            | React.ReactNode
            | ((
                params: RouteInfoByPath<
                  TAllRouteInfo,
                  ResolveRelativePath<'/', NoInfer<TTo>>
                >['allParams'],
              ) => React.ReactNode)
        },
    ) => JSX.Element
  }

  interface Route<
    TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
    TRouteInfo extends AnyRouteInfo = RouteInfo,
  > {
    useRoute: <
      TTo extends string = '.',
      TResolved extends string = ResolveRelativePath<
        TRouteInfo['id'],
        NoInfer<TTo>
      >,
    >(
      routeId: CheckId<
        TAllRouteInfo,
        TResolved,
        ToIdOption<TAllRouteInfo, TRouteInfo['id'], TTo>
      >,
      opts?: { strict?: boolean },
    ) => Route<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TResolved]>
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

const useRouterSubscription = (router: Router<any, any>) => {
  useSyncExternalStore(
    (cb) => router.subscribe(() => cb()),
    () => router.state,
    () => router.state,
  )
}

export function createReactRouter<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
>(opts: RouterOptions<TRouteConfig>): Router<TRouteConfig> {
  const makeRouteExt = (
    route: AnyRoute,
    router: Router<any, any>,
  ): Pick<AnyRoute, 'useRoute' | 'linkProps' | 'Link' | 'MatchRoute'> => {
    return {
      useRoute: (subRouteId = '.' as any) => {
        const resolvedRouteId = router.resolvePath(
          route.routeId,
          subRouteId as string,
        )
        const resolvedRoute = router.getRoute(resolvedRouteId)
        useRouterSubscription(router)
        invariant(
          resolvedRoute,
          `Could not find a route for route "${
            resolvedRouteId as string
          }"! Did you forget to add it to your route config?`,
        )
        return resolvedRoute
      },
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
          isActive ? functionalUpdate(activeProps, {}) ?? {} : {}

        // Get the inactive props
        const resolvedInactiveProps: React.HTMLAttributes<HTMLAnchorElement> =
          isActive ? {} : functionalUpdate(inactiveProps, {}) ?? {}

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
      Link: React.forwardRef((props: any, ref) => {
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
                      isActive: (linkProps as any)['data-status'] === 'active',
                    })
                  : props.children,
            }}
          />
        )
      }) as any,
      MatchRoute: (opts) => {
        const { pending, caseSensitive, children, ...rest } = opts

        const params = route.matchRoute(rest as any, {
          pending,
          caseSensitive,
        })

        if (!params) {
          return null
        }

        return typeof opts.children === 'function'
          ? opts.children(params as any)
          : (opts.children as any)
      },
    }
  }

  const coreRouter = createRouter<TRouteConfig>({
    ...opts,
    createRouter: (router) => {
      const routerExt: Pick<Router<any, any>, 'useMatch' | 'useState'> = {
        useState: () => {
          useRouterSubscription(router)
          return router.state
        },
        useMatch: (routeId, opts) => {
          useRouterSubscription(router)

          invariant(
            routeId !== rootRouteId,
            `"${rootRouteId}" cannot be used with useMatch! Did you mean to useRoute("${rootRouteId}")?`,
          )

          const runtimeMatch = useMatches()?.[0]!
          const match = router.state.matches.find((d) => d.routeId === routeId)

          if (opts?.strict ?? true) {
            invariant(
              match,
              `Could not find an active match for "${routeId as string}"!`,
            )

            invariant(
              runtimeMatch.routeId == match?.routeId,
              `useMatch('${
                match?.routeId as string
              }') is being called in a component that is meant to render the '${
                runtimeMatch.routeId
              }' route. Did you mean to 'useMatch(${
                match?.routeId as string
              }, { strict: false })' or 'useRoute(${
                match?.routeId as string
              })' instead?`,
            )
          }

          return match as any
        },
      }

      const routeExt = makeRouteExt(router.getRoute('/'), router)

      Object.assign(router, routerExt, routeExt)
    },
    createRoute: ({ router, route }) => {
      const routeExt = makeRouteExt(route, router)

      Object.assign(route, routeExt)
    },
    loadComponent: async (component) => {
      if (component.preload && typeof document !== 'undefined') {
        component.preload()
        // return await component.preload()
      }

      return component as any
    },
  })

  return coreRouter as any
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

  useRouterSubscription(router)
  useLayoutEffect(() => {
    const unsub = router.mount()
    router.load()
    return unsub
  }, [router])

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

export function useMatches(): RouteMatch[] {
  return React.useContext(matchesContext)
}

export function Outlet() {
  const router = useRouter()
  const matches = useMatches().slice(1)
  const match = matches[0]

  if (!match) {
    return null
  }

  const defaultPending = React.useCallback(() => null, [])

  const PendingComponent = (match.__.pendingComponent ??
    router.options.defaultPendingComponent ??
    defaultPending) as any

  const errorComponent =
    match.__.errorComponent ?? router.options.defaultErrorComponent

  return (
    <MatchesProvider value={matches}>
      <React.Suspense fallback={<PendingComponent />}>
        <CatchBoundary errorComponent={errorComponent}>
          {
            ((): React.ReactNode => {
              if (match.status === 'error') {
                throw match.error
              }

              if (match.status === 'success') {
                return React.createElement(
                  (match.__.component as any) ??
                    router.options.defaultComponent ??
                    Outlet,
                )
              }

              if (match.__.loadPromise) {
                console.log(match.matchId, 'suspend')
                throw match.__.loadPromise
              }

              invariant(false, 'This should never happen!')
            })() as JSX.Element
          }
        </CatchBoundary>
      </React.Suspense>
    </MatchesProvider>
  )
}

class CatchBoundary extends React.Component<{
  children: any
  errorComponent: any
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
  render() {
    const errorComponent = this.props.errorComponent ?? DefaultErrorBoundary

    if (this.state.error) {
      return React.createElement(errorComponent, this.state)
    }

    return this.props.children
  }
}

export function DefaultErrorBoundary({ error }: { error: any }) {
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
    </div>
  )
}

export function usePrompt(message: string, when: boolean | any): void {
  const router = useRouter()

  React.useEffect(() => {
    if (!when) return

    let unblock = router.history.block((transition) => {
      if (window.confirm(message)) {
        unblock()
        transition.retry()
      } else {
        router.location.pathname = window.location.pathname
      }
    })

    return unblock
  }, [when, location, message])
}

export function Prompt({ message, when, children }: PromptProps) {
  usePrompt(message, when ?? true)
  return (children ?? null) as React.ReactNode
}
