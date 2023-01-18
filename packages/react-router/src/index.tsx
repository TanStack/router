import * as React from 'react'

import {
  Route,
  RegisteredAllRouteInfo,
  RegisteredRouter,
  RouterStore,
  last,
  warning,
  RouterOptions,
  RouteMatch,
  MatchRouteOptions,
  RouteConfig,
  AnyRouteConfig,
  AnyAllRouteInfo,
  DefaultAllRouteInfo,
  functionalUpdate,
  AllRouteInfo,
  ValidFromPath,
  LinkOptions,
  RouteInfoByPath,
  ResolveRelativePath,
  NoInfer,
  ToOptions,
  invariant,
  Router,
  Expand,
  Action,
  ActionStore,
  ActionSubmission,
} from '@tanstack/router-core'
import { useStore } from './useStore'

//

export * from '@tanstack/router-core'

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
  TFrom extends RegisteredAllRouteInfo['routePaths'] = '/',
  TTo extends string = '.',
> = LinkOptions<RegisteredAllRouteInfo, TFrom, TTo> & {
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
  TFrom extends RegisteredAllRouteInfo['routePaths'] = '/',
  TTo extends string = '.',
> = ToOptions<RegisteredAllRouteInfo, TFrom, TTo> & MatchRouteOptions

export type MakeMatchRouteOptions<
  TFrom extends RegisteredAllRouteInfo['routePaths'] = '/',
  TTo extends string = '.',
> = ToOptions<RegisteredAllRouteInfo, TFrom, TTo> &
  MatchRouteOptions & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | ReactNode
      | ((
          params: RouteInfoByPath<
            RegisteredAllRouteInfo,
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['allParams'],
        ) => ReactNode)
  }

export type MakeLinkPropsOptions<
  TFrom extends ValidFromPath<RegisteredAllRouteInfo> = '/',
  TTo extends string = '.',
> = LinkPropsOptions<TFrom, TTo> & React.AnchorHTMLAttributes<HTMLAnchorElement>

export type MakeLinkOptions<
  TFrom extends RegisteredAllRouteInfo['routePaths'] = '/',
  TTo extends string = '.',
> = LinkPropsOptions<TFrom, TTo> &
  React.AnchorHTMLAttributes<HTMLAnchorElement> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?: ReactNode | ((state: { isActive: boolean }) => ReactNode)
  }

declare module '@tanstack/router-core' {
  interface FrameworkGenerics {
    Component: RouteComponent
    ErrorComponent: RouteComponent<{
      error: unknown
      info: { componentStack: string }
    }>
  }

  interface RouterOptions<TRouteConfig, TRouterContext> {
    // ssrFooter?: () => JSX.Element | Node
  }
}

export type PromptProps = {
  message: string
  when?: boolean | any
  children?: ReactNode
}

//

export function useLinkProps<
  TFrom extends ValidFromPath<RegisteredAllRouteInfo> = '/',
  TTo extends string = '.',
>(
  options: MakeLinkPropsOptions<TFrom, TTo>,
): React.AnchorHTMLAttributes<HTMLAnchorElement> {
  const router = useRouter()

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
  TDefaultFrom extends RegisteredAllRouteInfo['routePaths'] = '/',
  TDefaultTo extends string = '.',
> {
  <
    TFrom extends RegisteredAllRouteInfo['routePaths'] = TDefaultFrom,
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

type MatchesContextValue = RouteMatch[]

export const matchesContext = React.createContext<MatchesContextValue>(null!)
export const routerContext = React.createContext<{ router: RegisteredRouter }>(
  null!,
)

export type MatchesProviderProps = {
  value: MatchesContextValue
  children: ReactNode
}

export class ReactRouter<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
  TRouterContext = unknown,
> extends Router<TRouteConfig, TAllRouteInfo, TRouterContext> {
  constructor(opts: RouterOptions<TRouteConfig, TRouterContext>) {
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
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouterContext = unknown,
> = RouterOptions<TRouteConfig, TRouterContext> & {
  router: Router<TRouteConfig, TAllRouteInfo, TRouterContext>
}

export function RouterProvider<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouterContext = unknown,
>({
  router,
  ...rest
}: RouterProps<TRouteConfig, TAllRouteInfo, TRouterContext>) {
  router.update(rest)

  const [, , currentMatches] = useStore(
    router.store,
    (s) => [s.status, s.pendingMatches, s.currentMatches],
    true,
  )

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

export function useRouter(): RegisteredRouter {
  const value = React.useContext(routerContext)
  warning(!value, 'useRouter must be used inside a <Router> component!')
  return value.router
}

export function useRouterStore<T = RouterStore>(
  selector?: (state: Router['store']) => T,
  shallow?: boolean,
): T {
  const router = useRouter()
  return useStore(router.store, selector as any, shallow)
}

export function useMatches(): RouteMatch[] {
  return React.useContext(matchesContext)
}

export function useMatch<
  TFrom extends keyof RegisteredAllRouteInfo['routeInfoById'],
  TStrict extends boolean = true,
  TRouteMatch = RouteMatch<
    RegisteredAllRouteInfo,
    RegisteredAllRouteInfo['routeInfoById'][TFrom]
  >,
>(opts?: {
  from: TFrom
  strict?: TStrict
  track?: (match: TRouteMatch) => any
  shallow?: boolean
}): TStrict extends true ? TRouteMatch : TRouteMatch | undefined {
  const router = useRouter()
  const nearestMatch = useMatches()[0]!
  const match = opts?.from
    ? router.store.state.currentMatches.find((d) => d.route.id === opts?.from)
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
    match!.store,
    (d) => opts?.track?.(match as any) ?? match,
    opts?.shallow,
  )

  return match as any
}

export function useRoute<
  TId extends keyof RegisteredAllRouteInfo['routeInfoById'] = '/',
>(
  routeId: TId,
): Route<RegisteredAllRouteInfo, RegisteredAllRouteInfo['routeInfoById'][TId]> {
  const router = useRouter()
  const resolvedRoute = router.getRoute(routeId as any)

  invariant(
    resolvedRoute,
    `Could not find a route for route "${
      routeId as string
    }"! Did you forget to add it to your route config?`,
  )

  return resolvedRoute as any
}

export function useLoaderData<
  TFrom extends keyof RegisteredAllRouteInfo['routeInfoById'] = '/',
  TStrict extends boolean = true,
  TLoaderData = RegisteredAllRouteInfo['routeInfoById'][TFrom]['loaderData'],
>(opts?: {
  from: TFrom
  strict?: TStrict
  track?: (loaderData: TLoaderData) => any
}): TStrict extends true ? TLoaderData : TLoaderData | undefined {
  const match = useMatch(opts)

  invariant(
    match,
    `Could not find ${
      opts?.from ? `an active match from "${opts.from}"` : 'a nearest match!'
    }`,
  )

  useStore(
    (match as any).store,
    (d: any) => opts?.track?.(d.loaderData) ?? d.loaderData,
  )

  return (match as unknown as RouteMatch).store.state.loaderData as any
}

export function useSearch<
  TFrom extends keyof RegisteredAllRouteInfo['routeInfoById'],
  TStrict extends boolean = true,
  TSearch = RegisteredAllRouteInfo['routeInfoById'][TFrom]['fullSearchSchema'],
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
  )

  return (match as unknown as RouteMatch).store.state.search as any
}

export function useParams<
  TFrom extends keyof RegisteredAllRouteInfo['routeInfoById'] = '/',
  TDefaultSelected = Expand<
    RegisteredAllRouteInfo['allParams'] &
      RegisteredAllRouteInfo['routeInfoById'][TFrom]['allParams']
  >,
  TSelected = TDefaultSelected,
>(opts?: {
  from: TFrom
  track?: (search: TDefaultSelected) => TSelected
}): TSelected {
  const router = useRouter()
  useStore(router.store, (d) => {
    const params = last(d.currentMatches)?.params as any
    return opts?.track?.(params) ?? params
  })

  return last(router.store.state.currentMatches)?.params as any
}

export function useNavigate<
  TDefaultFrom extends keyof RegisteredAllRouteInfo['routeInfoById'] = '/',
>(defaultOpts: { from?: TDefaultFrom }) {
  const router = useRouter()
  return <
    TFrom extends keyof RegisteredAllRouteInfo['routeInfoById'] = TDefaultFrom,
    TTo extends string = '.',
  >(
    opts: MakeLinkOptions<TFrom, TTo>,
  ) => {
    return router.navigate({ ...defaultOpts, ...(opts as any) })
  }
}

export function useMatchRoute() {
  const router = useRouter()

  return <
    TFrom extends ValidFromPath<RegisteredAllRouteInfo> = '/',
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
  TFrom extends ValidFromPath<RegisteredAllRouteInfo> = '/',
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
  const router = useRouter()
  useStore(match!.store)

  const defaultPending = React.useCallback(() => null, [])

  const Inner = React.useCallback((props: { match: RouteMatch }): any => {
    if (props.match.store.state.status === 'error') {
      throw props.match.store.state.error
    }

    if (props.match.store.state.status === 'success') {
      return React.createElement(
        (props.match.component as any) ??
          router.options.defaultComponent ??
          Outlet,
      )
    }

    if (props.match.store.state.status === 'loading') {
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
      <React.Suspense fallback={<PendingComponent />}>
        <CatchBoundary
          key={match.route.id}
          errorComponent={errorComponent}
          match={match as any}
        >
          <Inner match={match} />
        </CatchBoundary>
      </React.Suspense>
      {/* Provide a suffix suspense boundary to make sure the router is
  ready to be dehydrated on the server */}
      {/* {router.options.ssrFooter && match.matchId === rootRouteId ? (
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

// This is the messiest thing ever... I'm either seriously tired (likely) or
// there has to be a better way to reset error boundaries when the
// router's location key changes.
function CatchBoundaryInner(props: {
  children: any
  errorComponent: any
  errorState: { error: unknown; info: any }
  reset: () => void
}) {
  const [activeErrorState, setActiveErrorState] = React.useState(
    props.errorState,
  )
  const router = useRouter()
  const errorComponent = props.errorComponent ?? DefaultErrorBoundary

  // React.useEffect(() => {
  //   if (activeErrorState) {
  //     let prevKey = router.store.currentLocation.key
  //     return createRoot((dispose) => {
  //       createEffect(() => {
  //         if (router.store.currentLocation.key !== prevKey) {
  //           prevKey = router.store.currentLocation.key
  //           setActiveErrorState({} as any)
  //         }
  //       })

  //       return dispose
  //     })
  //   }

  //   return
  // }, [activeErrorState])

  React.useEffect(() => {
    if (props.errorState.error) {
      setActiveErrorState(props.errorState)
    }
    props.reset()
  }, [props.errorState.error])

  if (props.errorState.error) {
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

export function useAction<
  TKey extends string = string,
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
>(
  action: Action<TKey, TPayload, TResponse, TError>,
  opts?: {
    track?: (actionStore: ActionStore<TPayload, TResponse, TError>) => any
  },
): Action & {
  latestSubmission: ActionSubmission<TPayload, TResponse, TError>
  pendingSubmissions: ActionSubmission<TPayload, TResponse, TError>[]
} {
  useStore(action.store, (d) => opts?.track?.(d) ?? d, true)

  const [ref] = React.useState({})

  Object.assign(ref, {
    ...action,
    latestSubmission:
      action.store.state.submissions[action.store.state.submissions.length - 1],
    pendingSubmissions: React.useMemo(
      () =>
        action.store.state.submissions.filter((d) => d.status === 'pending'),
      [action.store.state.submissions],
    ),
  })

  return ref as any
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
