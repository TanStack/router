import * as React from 'react'

import {
  Route,
  RegisteredRoutesInfo,
  RegisteredRouter,
  RouterStore,
  last,
  warning,
  RouterOptions,
  RouteMatch,
  MatchRouteOptions,
  AnyRoute,
  AnyRoutesInfo,
  DefaultRoutesInfo,
  functionalUpdate,
  RoutesInfo,
  ValidFromPath,
  LinkOptions,
  RouteByPath,
  ResolveRelativePath,
  NoInfer,
  ToOptions,
  invariant,
  Router,
  Expand,
  AnyContext,
  AnyRootRoute,
  RootRoute,
  AnySearchSchema,
  AnyPathParams,
  AnyRouteMatch,
} from '@tanstack/router'
import { useStore } from '@tanstack/react-store'

//

export * from '@tanstack/router'

export { useStore }

//

type ReactNode = any

export type SyncRouteComponent<TProps = {}> = (props: TProps) => ReactNode

export type RouteComponent<TProps = {}> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export function lazy(
  importer: () => Promise<{ default: SyncRouteComponent }>,
): RouteComponent {
  const lazyComp = React.lazy(importer as any)
  let preloaded: Promise<SyncRouteComponent>

  const finalComp = lazyComp as unknown as RouteComponent

  finalComp.preload = async () => {
    if (!preloaded) {
      await importer()
    }
  }

  return finalComp
}

export type LinkPropsOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '.',
> = LinkOptions<RegisteredRoutesInfo, TFrom, TTo> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
}

export type MakeUseMatchRouteOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '.',
> = ToOptions<RegisteredRoutesInfo, TFrom, TTo> & MatchRouteOptions

export type MakeMatchRouteOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '.',
> = ToOptions<RegisteredRoutesInfo, TFrom, TTo> &
  MatchRouteOptions & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | ReactNode
      | ((
          params: RouteByPath<
            RegisteredRoutesInfo,
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['__types']['allParams'],
        ) => ReactNode)
  }

export type MakeLinkPropsOptions<
  TFrom extends ValidFromPath<RegisteredRoutesInfo> = '/',
  TTo extends string = '.',
> = LinkPropsOptions<TFrom, TTo> & React.AnchorHTMLAttributes<HTMLAnchorElement>

export type MakeLinkOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '.',
> = LinkPropsOptions<TFrom, TTo> &
  React.AnchorHTMLAttributes<HTMLAnchorElement> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?: ReactNode | ((state: { isActive: boolean }) => ReactNode)
  }

declare module '@tanstack/router' {
  interface FrameworkGenerics {
    Component: RouteComponent
    ErrorComponent: RouteComponent<{
      error: unknown
      info: { componentStack: string }
    }>
  }

  interface RouterOptions<TRouteTree> {
    // ssrFooter?: () => JSX.Element | Node
  }

  interface FrameworkRouteOptions {
    wrapInSuspense?: boolean
  }
}

export type PromptProps = {
  message: string
  when?: boolean | any
  children?: ReactNode
}

//

export function useLinkProps<
  TFrom extends ValidFromPath<RegisteredRoutesInfo> = '/',
  TTo extends string = '.',
>(
  options: MakeLinkPropsOptions<TFrom, TTo>,
): React.AnchorHTMLAttributes<HTMLAnchorElement> {
  const router = useRouterContext()

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
    to = '.',
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

  const linkInfo = router.buildLink(options as any)

  if (linkInfo.type === 'external') {
    const { href } = linkInfo
    return { href }
  }

  const { handleClick, handleFocus, handleEnter, handleLeave, isActive, next } =
    linkInfo

  const reactHandleClick = (e: Event) => {
    if (React.startTransition) {
      // This is a hack for react < 18
      React.startTransition(() => {
        handleClick(e)
      })
    } else {
      handleClick(e)
    }
  }

  const composeHandlers =
    (handlers: (undefined | ((e: any) => void))[]) =>
    (e: React.SyntheticEvent) => {
      if (e.persist) e.persist()
      handlers.filter(Boolean).forEach((handler) => {
        if (e.defaultPrevented) return
        handler!(e)
      })
    }

  // Get the active props
  const resolvedActiveProps: React.HTMLAttributes<HTMLAnchorElement> = isActive
    ? functionalUpdate(activeProps as any, {}) ?? {}
    : {}

  // Get the inactive props
  const resolvedInactiveProps: React.HTMLAttributes<HTMLAnchorElement> =
    isActive ? {} : functionalUpdate(inactiveProps, {}) ?? {}

  return {
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    ...rest,
    href: disabled ? undefined : next.href,
    onClick: composeHandlers([onClick, reactHandleClick]),
    onFocus: composeHandlers([onFocus, handleFocus]),
    onMouseEnter: composeHandlers([onMouseEnter, handleEnter]),
    onMouseLeave: composeHandlers([onMouseLeave, handleLeave]),
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
}

export interface LinkFn<
  TDefaultFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TDefaultTo extends string = '.',
> {
  <
    TFrom extends RegisteredRoutesInfo['routePaths'] = TDefaultFrom,
    TTo extends string = TDefaultTo,
  >(
    props: MakeLinkOptions<TFrom, TTo> & React.RefAttributes<HTMLAnchorElement>,
  ): ReactNode
}

export const Link: LinkFn = React.forwardRef((props: any, ref) => {
  const linkProps = useLinkProps(props)

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
}) as any

type MatchesContextValue = AnyRouteMatch[]

export const matchesContext = React.createContext<MatchesContextValue>(null!)
export const routerContext = React.createContext<{ router: RegisteredRouter }>(
  null!,
)

export type MatchesProviderProps = {
  value: MatchesContextValue
  children: ReactNode
}

export class ReactRouter<
  TRouteConfig extends AnyRootRoute = RootRoute,
  TRoutesInfo extends AnyRoutesInfo = RoutesInfo<TRouteConfig>,
> extends Router<TRouteConfig, TRoutesInfo> {
  constructor(opts: RouterOptions<TRouteConfig>) {
    super({
      ...opts,
      loadComponent: async (component) => {
        if (component.preload) {
          await component.preload()
        }

        return component as any
      },
    })
  }
}

export type RouterProps<
  TRouteConfig extends AnyRootRoute = RootRoute,
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
> = RouterOptions<TRouteConfig> & {
  router: Router<TRouteConfig, TRoutesInfo>
}

export function RouterProvider<
  TRouteConfig extends AnyRootRoute = RootRoute,
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
>({ router, ...rest }: RouterProps<TRouteConfig, TRoutesInfo>) {
  router.update(rest)

  const currentMatches = useStore(router.store, (s) => s.currentMatches)

  React.useEffect(router.mount, [router])

  return (
    <>
      <routerContext.Provider value={{ router: router as any }}>
        <matchesContext.Provider value={[undefined!, ...currentMatches]}>
          <Outlet />
        </matchesContext.Provider>
      </routerContext.Provider>
    </>
  )
}

export function useRouterContext(): RegisteredRouter {
  const value = React.useContext(routerContext)
  warning(!value, 'useRouter must be used inside a <Router> component!')

  useStore(value.router.store)

  return value.router
}

export function useRouter<T = RouterStore>(
  track?: (state: Router['store']) => T,
  shallow?: boolean,
): RegisteredRouter {
  const router = useRouterContext()
  useStore(router.store, track as any, shallow)
  return router
}

export function useMatches(): RouteMatch[] {
  return React.useContext(matchesContext)
}

export function useMatch<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TRouteMatch = RouteMatch<
    RegisteredRoutesInfo,
    RegisteredRoutesInfo['routesById'][TFrom]
  >,
>(opts?: {
  from: TFrom
  strict?: TStrict
  track?: (match: TRouteMatch) => any
  shallow?: boolean
}): TStrict extends true ? TRouteMatch : TRouteMatch | undefined {
  const router = useRouterContext()
  const nearestMatch = useMatches()[0]!
  const match = opts?.from
    ? router.state.currentMatches.find((d) => d.route.id === opts?.from)
    : nearestMatch

  invariant(
    match,
    `Could not find ${
      opts?.from ? `an active match from "${opts.from}"` : 'a nearest match!'
    }`,
  )

  if (opts?.strict ?? true) {
    invariant(
      nearestMatch.route.id == match?.route.id,
      `useMatch("${
        match?.route.id as string
      }") is being called in a component that is meant to render the '${
        nearestMatch.route.id
      }' route. Did you mean to 'useMatch("${
        match?.route.id as string
      }", { strict: false })' or 'useRoute("${
        match?.route.id as string
      }")' instead?`,
    )
  }

  useStore(
    match!.store as any,
    (d) => opts?.track?.(match as any) ?? match,
    opts?.shallow,
  )

  return match as any
}

export function useRoute<
  TId extends keyof RegisteredRoutesInfo['routesById'] = '/',
>(routeId: TId): RegisteredRoutesInfo['routesById'][TId] {
  const router = useRouterContext()
  const resolvedRoute = router.getRoute(routeId as any)

  invariant(
    resolvedRoute,
    `Could not find a route for route "${
      routeId as string
    }"! Did you forget to add it to your route config?`,
  )

  return resolvedRoute as any
}

export function useSearch<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TSearch = RegisteredRoutesInfo['routesById'][TFrom]['__types']['fullSearchSchema'],
  TSelected = TSearch,
>(opts?: {
  from: TFrom
  strict?: TStrict
  track?: (search: TSearch) => TSelected
}): TStrict extends true ? TSelected : TSelected | undefined {
  const match = useMatch(opts)
  useStore(
    (match as any).store,
    (d: any) => opts?.track?.(d.search) ?? d.search,
    true,
  )

  return (match as unknown as RouteMatch).state.search as any
}

export function useParams<
  TFrom extends keyof RegisteredRoutesInfo['routesById'] = '/',
  TDefaultSelected = RegisteredRoutesInfo['allParams'] &
    RegisteredRoutesInfo['routesById'][TFrom]['__types']['allParams'],
  TSelected = TDefaultSelected,
>(opts?: {
  from: TFrom
  track?: (search: TDefaultSelected) => TSelected
}): TSelected {
  const router = useRouterContext()
  useStore(
    router.store,
    (d) => {
      const params = last(d.currentMatches)?.params as any
      return opts?.track?.(params) ?? params
    },
    true,
  )

  return last(router.state.currentMatches)?.params as any
}

export function useNavigate<
  TDefaultFrom extends keyof RegisteredRoutesInfo['routesById'] = '/',
>(defaultOpts?: { from?: TDefaultFrom }) {
  const router = useRouterContext()
  return <
    TFrom extends keyof RegisteredRoutesInfo['routesById'] = TDefaultFrom,
    TTo extends string = '.',
  >(
    opts?: MakeLinkOptions<TFrom, TTo>,
  ) => {
    return router.navigate({ ...defaultOpts, ...(opts as any) })
  }
}

export function useMatchRoute() {
  const router = useRouterContext()

  return <
    TFrom extends ValidFromPath<RegisteredRoutesInfo> = '/',
    TTo extends string = '.',
  >(
    opts: MakeUseMatchRouteOptions<TFrom, TTo>,
  ) => {
    const { pending, caseSensitive, ...rest } = opts

    return router.matchRoute(rest as any, {
      pending,
      caseSensitive,
    })
  }
}

export function MatchRoute<
  TFrom extends ValidFromPath<RegisteredRoutesInfo> = '/',
  TTo extends string = '.',
>(props: MakeMatchRouteOptions<TFrom, TTo>): any {
  const matchRoute = useMatchRoute()
  const params = matchRoute(props)

  if (!params) {
    return null
  }

  if (typeof props.children === 'function') {
    return (props.children as any)(params)
  }

  return params ? props.children : null
}

export function Outlet() {
  const matches = useMatches().slice(1)
  const match = matches[0]

  if (!match) {
    return null
  }

  return <SubOutlet matches={matches} match={match} />
}

function SubOutlet({
  matches,
  match,
}: {
  matches: RouteMatch[]
  match: RouteMatch
}) {
  const router = useRouterContext()
  useStore(match!.store, (store) => [store.status, store.error], true)

  const defaultPending = React.useCallback(() => null, [])

  const Inner = React.useCallback((props: { match: RouteMatch }): any => {
    if (props.match.state.status === 'error') {
      throw props.match.state.error
    }

    if (props.match.state.status === 'success') {
      return React.createElement(
        (props.match.component as any) ??
          router.options.defaultComponent ??
          Outlet,
      )
    }

    if (props.match.state.status === 'pending') {
      throw props.match.__loadPromise
    }

    invariant(
      false,
      'Idle routeMatch status encountered during rendering! You should never see this. File an issue!',
    )
  }, [])

  const PendingComponent = (match.pendingComponent ??
    router.options.defaultPendingComponent ??
    defaultPending) as any

  const errorComponent =
    match.errorComponent ?? router.options.defaultErrorComponent

  return (
    <matchesContext.Provider value={matches}>
      {match.route.options.wrapInSuspense ?? true ? (
        <React.Suspense fallback={<PendingComponent />}>
          <CatchBoundary
            key={match.route.id}
            errorComponent={errorComponent}
            match={match as any}
          >
            <Inner match={match} />
          </CatchBoundary>
        </React.Suspense>
      ) : (
        <CatchBoundary
          key={match.route.id}
          errorComponent={errorComponent}
          match={match as any}
        >
          <Inner match={match} />
        </CatchBoundary>
      )}
      {/* Provide a suffix suspense boundary to make sure the router is
  ready to be dehydrated on the server */}
      {/* {router.options.ssrFooter && match.id === rootRouteId ? (
        <React.Suspense fallback={null}>
          {(() => {
            if (router.store.pending) {
              throw router.navigationPromise
            }

            return router.options.ssrFooter()
          })()}
        </React.Suspense>
      ) : null} */}
    </matchesContext.Provider>
  )
}

// This is the messiest thing ever... I'm either seriously tired (likely) or
// there has to be a better way to reset error boundaries when the
// router's location key changes.

class CatchBoundary extends React.Component<{
  children: any
  errorComponent: any
  match: RouteMatch
}> {
  state = {
    error: false,
    info: undefined,
  }
  componentDidCatch(error: any, info: any) {
    console.error(`Error in route match: ${this.props.match.id}`)
    console.error(error)
    this.setState({
      error,
      info,
    })
  }
  render() {
    return (
      <CatchBoundaryInner
        {...this.props}
        errorState={this.state}
        reset={() => this.setState({})}
      />
    )
  }
}

function CatchBoundaryInner(props: {
  children: any
  errorComponent: any
  errorState: { error: unknown; info: any }
  reset: () => void
}) {
  const [activeErrorState, setActiveErrorState] = React.useState(
    props.errorState,
  )
  const router = useRouterContext()
  const errorComponent = props.errorComponent ?? DefaultErrorBoundary
  const prevKeyRef = React.useRef('' as any)

  React.useEffect(() => {
    if (activeErrorState) {
      if (router.state.currentLocation.key !== prevKeyRef.current) {
        setActiveErrorState({} as any)
      }
    }

    prevKeyRef.current = router.state.currentLocation.key
  }, [activeErrorState, router.state.currentLocation.key])

  React.useEffect(() => {
    if (props.errorState.error) {
      setActiveErrorState(props.errorState)
    }
    // props.reset()
  }, [props.errorState.error])

  if (props.errorState.error && activeErrorState.error) {
    return React.createElement(errorComponent, activeErrorState)
  }

  return props.children
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

// TODO: While we migrate away from the history package, these need to be disabled
// export function usePrompt(message: string, when: boolean | any): void {
//   const router = useRouter()

//   React.useEffect(() => {
//     if (!when) return

//     let unblock = router.getHistory().block((transition) => {
//       if (window.confirm(message)) {
//         unblock()
//         transition.retry()
//       } else {
//         router.setStore((s) => {
//           s.currentLocation.pathname = window.location.pathname
//         })
//       }
//     })

//     return unblock
//   }, [when, message])
// }

// export function Prompt({ message, when, children }: PromptProps) {
//   usePrompt(message, when ?? true)
//   return (children ?? null) as ReactNode
// }
