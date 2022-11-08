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

declare module '@tanstack/router-core' {
  interface FrameworkGenerics {
    Element: React.ReactNode
    // Any is required here so import() will work without having to do import().then(d => d.default)
    SyncOrAsyncElement: React.ReactNode | (() => Promise<any>)
  }

  interface Router<
    TRouteConfig extends AnyRouteConfig = RouteConfig,
    TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
  > {
    useState: () => RouterState
    useRoute: <TId extends keyof TAllRouteInfo['routeInfoById']>(
      routeId: TId,
    ) => Route<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
    useMatch: <TId extends keyof TAllRouteInfo['routeInfoById']>(
      routeId: TId,
    ) => RouteMatch<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
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
        useMatch: (routeId) => {
          useRouterSubscription(router)

          invariant(
            routeId !== rootRouteId,
            `"${rootRouteId}" cannot be used with useMatch! Did you mean to useRoute("${rootRouteId}")?`,
          )

          const runtimeMatch = useMatch()
          const match = router.state.matches.find((d) => d.routeId === routeId)

          invariant(
            match,
            `Could not find a match for route "${
              routeId as string
            }" being rendered in this component!`,
          )

          invariant(
            runtimeMatch.routeId == match?.routeId,
            `useMatch('${
              match?.routeId as string
            }') is being called in a component that is meant to render the '${
              runtimeMatch.routeId
            }' route. Did you mean to 'useRoute(${
              match?.routeId as string
            })' instead?`,
          )

          if (!match) {
            invariant('Match not found!')
          }

          return match
        },
      }

      const routeExt = makeRouteExt(router.getRoute('/'), router)

      Object.assign(router, routerExt, routeExt)
    },
    createRoute: ({ router, route }) => {
      const routeExt = makeRouteExt(route, router)

      Object.assign(route, routeExt)
    },
    createElement: async (element) => {
      if (typeof element === 'function') {
        const res = (await element()) as any

        // Support direct import() calls
        if (typeof res === 'object' && res.default) {
          return React.createElement(res.default)
        } else {
          return res
        }
      }

      return element
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
    return router.mount()
  }, [router])

  return (
    <routerContext.Provider value={{ router }}>
      <MatchesProvider value={router.state.matches}>
        {children ?? <Outlet />}
      </MatchesProvider>
    </routerContext.Provider>
  )
}

function useRouter(): Router {
  const value = React.useContext(routerContext)
  warning(!value, 'useRouter must be used inside a <Router> component!')

  useRouterSubscription(value.router)

  return value.router as Router
}

function useMatches(): RouteMatch[] {
  return React.useContext(matchesContext)
}

// function useParentMatches(): RouteMatch[] {
//   const router = useRouter()
//   const match = useMatch()
//   const matches = router.state.matches
//   return matches.slice(
//     0,
//     matches.findIndex((d) => d.matchId === match.matchId) - 1,
//   )
// }

function useMatch<T>(): RouteMatch {
  return useMatches()?.[0] as RouteMatch
}

export function Outlet() {
  const router = useRouter()
  const [, ...matches] = useMatches()

  const childMatch = matches[0]

  if (!childMatch) return null

  const element = ((): React.ReactNode => {
    if (!childMatch) {
      return null
    }

    const errorElement =
      childMatch.__.errorElement ?? router.options.defaultErrorElement

    if (childMatch.status === 'error') {
      if (errorElement) {
        return errorElement as any
      }

      if (
        childMatch.options.useErrorBoundary ||
        router.options.useErrorBoundary
      ) {
        throw childMatch.error
      }

      return <DefaultErrorBoundary error={childMatch.error} />
    }

    if (childMatch.status === 'loading' || childMatch.status === 'idle') {
      if (childMatch.isPending) {
        const pendingElement =
          childMatch.__.pendingElement ?? router.options.defaultPendingElement

        if (childMatch.options.pendingMs || pendingElement) {
          return (pendingElement as any) ?? null
        }
      }

      return null
    }

    return (childMatch.__.element as any) ?? router.options.defaultElement
  })() as JSX.Element

  const catchElement =
    childMatch?.options.catchElement ?? router.options.defaultCatchElement

  return (
    <MatchesProvider value={matches} key={childMatch.matchId}>
      <CatchBoundary catchElement={catchElement}>{element}</CatchBoundary>
    </MatchesProvider>
  )
}

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
    const catchElement = this.props.catchElement ?? DefaultErrorBoundary

    if (this.state.error) {
      return typeof catchElement === 'function'
        ? catchElement(this.state)
        : catchElement
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
