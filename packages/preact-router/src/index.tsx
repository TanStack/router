import * as Preact from 'preact'
import { Suspense, lazy as preactLazy } from 'preact/compat/src/suspense'
import { useRef, useEffect, useContext, useCallback } from 'preact/hooks'
import { useSyncExternalStore } from 'preact/compat'

import {
  AnyRoute,
  CheckId,
  rootRouteId,
  Route,
  RouterContext,
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
  Router,
} from '@tanstack/router-core'

export * from '@tanstack/router-core'

export interface RegisterRouter {
  // router: Router
}

export type RegisteredRouter = RegisterRouter extends {
  router: Router<infer TRouteConfig, infer TAllRouteInfo>
}
  ? Router<TRouteConfig, TAllRouteInfo>
  : Router

export type RegisteredAllRouteInfo = RegisterRouter extends {
  router: Router<infer TRouteConfig, infer TAllRouteInfo>
}
  ? TAllRouteInfo
  : AnyAllRouteInfo

export type SyncRouteComponent<TProps = {}> = (
  props: TProps,
) => Preact.ComponentChild

export type RouteComponent<TProps = {}> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<SyncRouteComponent<TProps>>
}

export function lazy(
  importer: () => Promise<{ default: SyncRouteComponent }>,
): RouteComponent {
  const lazyComp = preactLazy(importer as any)
  let promise: Promise<SyncRouteComponent>
  let resolvedComp: SyncRouteComponent

  const forwardedComp = forwardRef((props, ref) => {
    const resolvedCompRef = useRef(resolvedComp || lazyComp)
    return Preact.createElement(
      resolvedCompRef.current as any,
      { ...(ref ? { ref } : {}), ...props } as any,
    )
  })

  const finalComp = forwardedComp as unknown as RouteComponent

  finalComp.preload = () => {
    if (!promise) {
      promise = importer().then((module) => {
        resolvedComp = module.default
        return resolvedComp
      })
    }

    return promise
  }

  return finalComp
}

type LinkPropsOptions<
  TAllRouteInfo extends AnyAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo>,
  TTo extends string,
> = LinkOptions<TAllRouteInfo, TFrom, TTo> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?:
    | Preact.JSX.HTMLAttributes<HTMLAnchorElement>
    | (() => Preact.JSX.HTMLAttributes<HTMLAnchorElement>)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?:
    | Preact.JSX.HTMLAttributes<HTMLAnchorElement>
    | (() => Preact.JSX.HTMLAttributes<HTMLAnchorElement>)
}

type MakeMatchRouteOptions<
  TAllRouteInfo extends AnyAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo>,
  TTo extends string,
> = ToOptions<TAllRouteInfo, TFrom, TTo> &
  MatchRouteOptions & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | Preact.ComponentChildren
      | ((
          params: RouteInfoByPath<
            TAllRouteInfo,
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['allParams'],
        ) => Preact.ComponentChildren)
  }

type MakeLinkPropsOptions<
  TAllRouteInfo extends AnyAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo>,
  TTo extends string,
> = LinkPropsOptions<TAllRouteInfo, TFrom, TTo> &
  Preact.JSX.HTMLAttributes<HTMLAnchorElement>

type MakeLinkOptions<
  TAllRouteInfo extends AnyAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo>,
  TTo extends string,
> = LinkPropsOptions<TAllRouteInfo, TFrom, TTo> &
  Preact.JSX.HTMLAttributes<HTMLAnchorElement> &
  Omit<Preact.JSX.HTMLAttributes<HTMLAnchorElement>, 'children'> & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | Preact.ComponentChildren
      | ((state: { isActive: boolean }) => Preact.ComponentChildren)
  }

declare module '@tanstack/router-core' {
  interface FrameworkGenerics {
    Component: RouteComponent
    ErrorComponent: RouteComponent<{
      error: unknown
      info: { componentStack: string }
    }>
  }

  interface RouterOptions<TRouteConfig extends AnyRouteConfig> {
    useContext?: () => RouterContext
  }

  interface Router<
    TRouteConfig extends AnyRouteConfig = RouteConfig,
    TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
  > {
    useState: () => RouterState
    useRoute: <TId extends keyof TAllRouteInfo['routeInfoById']>(
      routeId: TId,
    ) => Route<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
    useNearestMatch: () => RouteMatch<TAllRouteInfo, RouteInfo>
    useMatch: <
      TId extends keyof TAllRouteInfo['routeInfoById'],
      TStrict extends boolean = true,
    >(
      routeId: TId,
      opts?: { strict?: TStrict },
    ) => TStrict extends true
      ? RouteMatch<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
      :
          | RouteMatch<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
          | undefined
    linkProps: <TTo extends string = '.'>(
      props: MakeLinkPropsOptions<TAllRouteInfo, '/', TTo>,
    ) => Preact.JSX.HTMLAttributes<HTMLAnchorElement>
    Link: <TTo extends string = '.'>(
      props: MakeLinkOptions<TAllRouteInfo, '/', TTo>,
    ) => JSX.Element
    MatchRoute: <TTo extends string = '.'>(
      props: MakeMatchRouteOptions<TAllRouteInfo, '/', TTo>,
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
      props: MakeLinkPropsOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>,
    ) => Preact.JSX.HTMLAttributes<HTMLAnchorElement>
    Link: <TTo extends string = '.'>(
      props: MakeLinkOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>,
    ) => JSX.Element
    MatchRoute: <TTo extends string = '.'>(
      props: MakeMatchRouteOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>,
    ) => JSX.Element
  }
}

export type PromptProps = {
  message: string
  when?: boolean | any
  children?: Preact.ComponentChildren
}

export function Link<TTo extends string = '.'>(
  props: MakeLinkOptions<RegisteredAllRouteInfo, '/', TTo>,
): JSX.Element {
  const router = useRouter()
  return <router.Link {...(props as any)} />
}

export const matchesContext = Preact.createContext<RouteMatch[]>(null!)
export const routerContext = Preact.createContext<{ router: RegisteredRouter }>(
  null!,
)

export type MatchesProviderProps = {
  value: RouteMatch[]
  children: Preact.ComponentChildren
}

export function MatchesProvider(props: MatchesProviderProps) {
  return <matchesContext.Provider {...props} />
}

const useRouterSubscription = (router: Router<any, any>) => {
  useSyncExternalStore(
    (cb) => router.subscribe(() => cb()),
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

        const linkInfo = route.buildLink(options as any)

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
          (handlers: (undefined | ((e: any) => void))[]) => (e: Event) => {
            // it should be OK to ignore in Preact
            // As of React@17, e.persist() doesn't do anything. https://reactjs.org/docs/legacy-event-pooling.html
            // e.persist()
            handlers.forEach((handler) => {
              if (handler) handler(e)
            })
          }

        // Get the active props
        const resolvedActiveProps: Preact.JSX.HTMLAttributes<HTMLAnchorElement> =
          isActive ? functionalUpdate(activeProps, {}) ?? {} : {}

        // Get the inactive props
        const resolvedInactiveProps: Preact.JSX.HTMLAttributes<HTMLAnchorElement> =
          isActive ? {} : functionalUpdate(inactiveProps, {}) ?? {}

        function mergeStyleProps(
          ...styles: (
            | string
            | Preact.JSX.CSSProperties
            | Preact.JSX.SignalLike<string | Preact.JSX.CSSProperties>
            | undefined
          )[]
        ):
          | string
          | Preact.JSX.CSSProperties
          | Preact.JSX.SignalLike<string | Preact.JSX.CSSProperties>
          | undefined {
          // TODO
          return styles[0]
        }

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
          style: mergeStyleProps(
            style,
            resolvedActiveProps.style,
            resolvedInactiveProps.style,
          ),
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
      Link: forwardRef((props: any, ref) => {
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
              `useMatch("${
                match?.routeId as string
              }") is being called in a component that is meant to render the '${
                runtimeMatch.routeId
              }' route. Did you mean to 'useMatch("${
                match?.routeId as string
              }", { strict: false })' or 'useRoute("${
                match?.routeId as string
              }")' instead?`,
            )
          }

          return match as any
        },
      }

      const routeExt = makeRouteExt(router.getRoute(rootRouteId), router)

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
  children?: Preact.ComponentChildren
}

export function RouterProvider<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
>({ children, router, ...rest }: RouterProps<TRouteConfig, TAllRouteInfo>) {
  router.update(rest)

  const defaultRouterContext = useRef({})

  const userContext =
    router.options.useContext?.() ?? defaultRouterContext.current

  router.context = userContext

  useRouterSubscription(router)
  useEffect(() => {
    return router.mount()
  }, [router])

  return (
    <routerContext.Provider value={{ router: router as any }}>
      <MatchesProvider value={router.state.matches}>
        {children ?? <Outlet />}
      </MatchesProvider>
    </routerContext.Provider>
  )
}

export function useRouter(): RegisteredRouter {
  const value = useContext(routerContext)
  warning(!value, 'useRouter must be used inside a <Router> component!')

  useRouterSubscription(value.router)

  return value.router
}

export function useMatches(): RouteMatch[] {
  return useContext(matchesContext)
}

export function useMatch<
  TId extends keyof RegisteredAllRouteInfo['routeInfoById'],
  TStrict extends boolean = true,
>(
  routeId: TId,
  opts?: { strict?: TStrict },
): TStrict extends true
  ? RouteMatch<
      RegisteredAllRouteInfo,
      RegisteredAllRouteInfo['routeInfoById'][TId]
    >
  :
      | RouteMatch<
          RegisteredAllRouteInfo,
          RegisteredAllRouteInfo['routeInfoById'][TId]
        >
      | undefined {
  const router = useRouter()
  return router.useMatch(routeId as any, opts) as any
}

export function useNearestMatch(): RouteMatch<
  RegisteredAllRouteInfo,
  RouteInfo
> {
  const runtimeMatch = useMatches()?.[0]!

  invariant(runtimeMatch, `Could not find a nearest match!`)

  return runtimeMatch as any
}

export function useRoute<
  TId extends keyof RegisteredAllRouteInfo['routeInfoById'],
>(
  routeId: TId,
): Route<RegisteredAllRouteInfo, RegisteredAllRouteInfo['routeInfoById'][TId]> {
  const router = useRouter()
  return router.useRoute(routeId as any) as any
}

export function useSearch<
  TId extends keyof RegisteredAllRouteInfo['routeInfoById'] = keyof RegisteredAllRouteInfo['routeInfoById'],
>(_routeId?: TId): RegisteredAllRouteInfo['fullSearchSchema'] {
  return useRouter().state.location.search
}

export function linkProps<TTo extends string = '.'>(
  props: MakeLinkPropsOptions<RegisteredAllRouteInfo, '/', TTo>,
): Preact.JSX.HTMLAttributes<HTMLAnchorElement> {
  const router = useRouter()
  return router.linkProps(props as any)
}

export function MatchRoute<TTo extends string = '.'>(
  props: MakeMatchRouteOptions<RegisteredAllRouteInfo, '/', TTo>,
): JSX.Element {
  const router = useRouter()
  return Preact.createElement(router.MatchRoute, props as any)
}

export function Outlet() {
  const router = useRouter()
  const matches = useMatches().slice(1)
  const match = matches[0]

  const defaultPending = useCallback(() => null, [])

  if (!match) {
    return null
  }

  const PendingComponent = (match.__.pendingComponent ??
    router.options.defaultPendingComponent ??
    defaultPending) as any

  const errorComponent =
    match.__.errorComponent ?? router.options.defaultErrorComponent

  return (
    <MatchesProvider value={matches}>
      <Suspense fallback={<PendingComponent />}>
        <CatchBoundary errorComponent={errorComponent}>
          {
            ((): Preact.VNode => {
              if (match.status === 'error') {
                throw match.error
              }

              if (match.status === 'success') {
                return Preact.createElement(
                  (match.__.component as any) ??
                    router.options.defaultComponent ??
                    Outlet,
                  null,
                )
              }
              throw match.__.loadPromise
            })() as JSX.Element
          }
        </CatchBoundary>
      </Suspense>
    </MatchesProvider>
  )
}

class CatchBoundary extends Preact.Component<{
  children: Preact.ComponentChildren
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
      return Preact.createElement(errorComponent, this.state)
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

  useEffect(() => {
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

export function Prompt({
  message,
  when,
  children,
}: PromptProps): Preact.ComponentChildren | null {
  usePrompt(message, when ?? true)
  return children ?? null
}

function forwardRef<TRef, T extends { ref?: Preact.RefObject<TRef> }>(
  fn: (props: T, ref: Preact.RefObject<TRef> | null) => any,
) {
  function Forwarded(props: T) {
    let clone = { ...props }
    delete clone.ref
    return fn(clone, props.ref || null)
  }

  // Forwarded.displayName = 'ForwardRef(' + (fn.displayName || fn.name) + ')';
  return Forwarded
}
