import * as React from 'react'
import { NoInfer, useStore } from '@tanstack/react-store'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  LinkOptions,
  ToOptions,
  ResolveRelativePath,
  NavigateOptions,
} from './link'
import { AnyRoute } from './route'
import { RouteByPath, AnyRoutesInfo, DefaultRoutesInfo } from './routeInfo'
import {
  RegisteredRoutesInfo,
  MatchRouteOptions,
  RegisteredRouter,
  RouterOptions,
  Router,
  RouteMatch,
} from './router'
import { functionalUpdate, last } from './utils'

//

export { useStore }

//

type ReactNode = any

export type SyncRouteComponent<TProps = {}> = (props: TProps) => ReactNode

export type RouteComponent<TProps = {}> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export function lazy<T extends Record<string, SyncRouteComponent>>(
  importer: () => Promise<T>,
  exportName: keyof T = 'default',
): RouteComponent {
  const lazyComp = React.lazy(async () => {
    const moduleExports = await importer()
    const component = moduleExports[exportName]
    return { default: component }
  })

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
  TTo extends string = '',
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
  TTo extends string = '',
> = ToOptions<RegisteredRoutesInfo, TFrom, TTo> & MatchRouteOptions

export type MakeMatchRouteOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
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
  TFrom extends string = '/',
  TTo extends string = '',
> = LinkPropsOptions<TFrom, TTo> & React.AnchorHTMLAttributes<HTMLAnchorElement>

export type MakeLinkOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = LinkPropsOptions<TFrom, TTo> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean }) => React.ReactNode)
  }

export type PromptProps = {
  message: string
  condition?: boolean | any
  children?: ReactNode
}

//

export function useLinkProps<
  TFrom extends string = '/',
  TTo extends string = '',
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
    replace,
    // element props
    style,
    className,
    onClick,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
    ...rest
  } = options

  const linkInfo = router.buildLink(options as any)

  if (linkInfo.type === 'external') {
    const { href } = linkInfo
    return { href }
  }

  const {
    handleClick,
    handleFocus,
    handleEnter,
    handleLeave,
    handleTouchStart,
    isActive,
    next,
  } = linkInfo

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
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
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
  TDefaultTo extends string = '',
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

export function Navigate<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
>(props: NavigateOptions<RegisteredRoutesInfo, TFrom, TTo>): null {
  const router = useRouter()

  React.useLayoutEffect(() => {
    router.navigate(props as any)
  }, [])

  return null
}

type MatchesContextValue = RouteMatch[]

export const matchesContext = React.createContext<MatchesContextValue>(null!)
export const routerStateContext = React.createContext<
  RegisteredRouter['state']
>(null!)
export const routerContext = React.createContext<RegisteredRouter>(null!)

export type MatchesProviderProps = {
  value: MatchesContextValue
  children: ReactNode
}

export type RouterProps<
  TRouteConfig extends AnyRoute = AnyRoute,
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<RouterOptions<TRouteConfig, TDehydrated>, 'context'> & {
  router: Router<TRouteConfig, TRoutesInfo>
  context?: Partial<RouterOptions<TRouteConfig, TDehydrated>['context']>
}

export function MatchesProvider({
  matches,
  children,
}: {
  matches: RouteMatch[]
  children: ReactNode
}) {
  return (
    <matchesContext.Provider value={matches}>
      {children}
    </matchesContext.Provider>
  )
}

const useLayoutEffect =
  typeof document === 'undefined' ? React.useEffect : React.useLayoutEffect

export function RouterProvider<
  TRouteConfig extends AnyRoute = AnyRoute,
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouteConfig, TRoutesInfo, TDehydrated>) {
  router.update(rest)

  const [state, _setState] = React.useState(() => router.state)

  const matches = state.matches

  // let unsubOptimistic = router.__store.subscribe(() => {
  //   unsubOptimistic()
  //   ;(React.startTransition || ((d) => d()))(() => _setState(router.state))
  // })

  useLayoutEffect(() => {
    // unsubOptimistic()
    return router.__store.subscribe(() => {
      Promise.resolve().then(() => {
        ;(React.startTransition || ((d) => d()))(() => _setState(router.state))
      })
    })
  })

  React.useEffect(router.mount, [router])

  const Wrap = router.options.Wrap || React.Fragment

  return (
    <Wrap>
      <routerContext.Provider value={router as any}>
        <routerStateContext.Provider value={state as any}>
          <matchesContext.Provider value={[undefined!, ...matches]}>
            <CatchBoundary
              errorComponent={ErrorComponent}
              onCatch={() => {
                warning(
                  false,
                  `Error in router! Consider setting an 'errorComponent' in your RootRoute! 👍`,
                )
              }}
            >
              <Outlet />
            </CatchBoundary>
          </matchesContext.Provider>
        </routerStateContext.Provider>
      </routerContext.Provider>
    </Wrap>
  )
}

export function useRouter(): RegisteredRouter {
  const value = React.useContext(routerContext)
  warning(value, 'useRouter must be used inside a <Router> component!')
  return value
}

export function useRouterState<T = Router['state']>(
  select?: (state: Router['state']) => T,
): T {
  const state = React.useContext(routerStateContext)
  const next = select?.(state) ?? (state as T)
  const valueRef = React.useRef(next)

  if (!shallow(valueRef.current, next)) {
    valueRef.current = next as any
  }

  return valueRef.current
}

export function useMatches(): RouteMatch[] {
  return React.useContext(matchesContext)
}

export function useMatch<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TRouteMatchState = RouteMatch<
    RegisteredRoutesInfo,
    RegisteredRoutesInfo['routesById'][TFrom]
  >,
>(opts?: {
  from: TFrom
  strict?: TStrict
  track?: (match: TRouteMatchState) => any
}): TStrict extends true ? TRouteMatchState : TRouteMatchState | undefined {
  const routerState = useRouterState()
  const nearestMatch = useMatches()[0]!
  const matches = routerState.matches
  const match = opts?.from
    ? matches.find((d) => d.routeId === opts?.from)
    : nearestMatch

  invariant(
    match,
    `Could not find ${
      opts?.from ? `an active match from "${opts.from}"` : 'a nearest match!'
    }`,
  )

  if (opts?.strict ?? true) {
    invariant(
      nearestMatch.routeId == match?.routeId,
      `useMatch("${
        match?.routeId as string
      }") is being called in a component that is meant to render the '${
        nearestMatch.routeId
      }' route. Did you mean to 'useMatch("${
        match?.routeId as string
      }", { strict: false })' or 'useRoute("${
        match?.routeId as string
      }")' instead?`,
    )
  }

  // useStore(match!.__store as any, (d) => opts?.track?.(match as any) ?? match)

  return match as any
}

export type RouteFromIdOrRoute<T> = T extends RegisteredRoutesInfo['routeUnion']
  ? T
  : T extends keyof RegisteredRoutesInfo['routesById']
  ? RegisteredRoutesInfo['routesById'][T]
  : T extends string
  ? keyof RegisteredRoutesInfo['routesById']
  : never

export function useLoader<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TLoader = RegisteredRoutesInfo['routesById'][TFrom]['__types']['loader'],
  TSelected = TLoader,
>(opts?: {
  from: TFrom
  strict?: TStrict
  // track?: (search: TLoader) => TSelected
}): TStrict extends true ? TSelected : TSelected | undefined {
  const { track, ...matchOpts } = opts as any
  return useMatch(matchOpts).loader as TSelected
}

export function useSearch<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TSearch = RegisteredRoutesInfo['routesById'][TFrom]['__types']['fullSearchSchema'],
  TSelected = TSearch,
>(opts?: {
  from: TFrom
  strict?: TStrict
  // track?: (search: TSearch) => TSelected
}): TStrict extends true ? TSelected : TSelected | undefined {
  const { track, ...matchOpts } = (opts ?? {}) as any
  const match = useMatch(matchOpts)
  return match.search as any
}

export function useParams<
  TFrom extends keyof RegisteredRoutesInfo['routesById'] = '/',
  TDefaultSelected = RegisteredRoutesInfo['allParams'] &
    RegisteredRoutesInfo['routesById'][TFrom]['__types']['allParams'],
  TSelected = TDefaultSelected,
>(opts?: {
  from: TFrom
  // track?: (search: TDefaultSelected) => TSelected
}): TSelected {
  return useRouterState((d) => {
    const params = last(d.matches)?.params as any
    return params
    // return opts?.track?.(params) ?? params
  })
}

export function useNavigate<
  TDefaultFrom extends RegisteredRoutesInfo['routePaths'] = '/',
>(defaultOpts?: { from?: TDefaultFrom }) {
  const router = useRouter()
  return React.useCallback(
    <
      TFrom extends RegisteredRoutesInfo['routePaths'] = TDefaultFrom,
      TTo extends string = '',
    >(
      opts?: NavigateOptions<RegisteredRoutesInfo, TFrom, TTo>,
    ) => {
      return router.navigate({ ...defaultOpts, ...(opts as any) })
    },
    [],
  )
}

export function useMatchRoute() {
  const router = useRouter()

  return React.useCallback(
    <TFrom extends string = '/', TTo extends string = ''>(
      opts: MakeUseMatchRouteOptions<TFrom, TTo>,
    ) => {
      const { pending, caseSensitive, ...rest } = opts

      return router.matchRoute(rest as any, {
        pending,
        caseSensitive,
      })
    },
    [],
  )
}

export function MatchRoute<TFrom extends string = '/', TTo extends string = ''>(
  props: MakeMatchRouteOptions<TFrom, TTo>,
): any {
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
  const defaultPending = React.useCallback(() => null, [])
  const route = router.getRoute(match.routeId)

  const PendingComponent = (route.options.pendingComponent ??
    router.options.defaultPendingComponent ??
    defaultPending) as any

  const errorComponent =
    route.options.errorComponent ?? router.options.defaultErrorComponent

  const ResolvedSuspenseBoundary =
    route.options.wrapInSuspense ?? !route.isRoot
      ? React.Suspense
      : SafeFragment

  const ResolvedCatchBoundary = errorComponent ? CatchBoundary : SafeFragment

  return (
    <matchesContext.Provider value={matches}>
      <ResolvedSuspenseBoundary fallback={<PendingComponent />}>
        <ResolvedCatchBoundary
          key={route.id}
          errorComponent={errorComponent}
          onCatch={() => {
            warning(false, `Error in route match: ${match.id}`)
          }}
        >
          <Inner match={match} />
        </ResolvedCatchBoundary>
      </ResolvedSuspenseBoundary>
    </matchesContext.Provider>
  )
}

export function useInjectHtml() {
  const router = useRouter()

  return React.useCallback(
    (html: string | (() => Promise<string> | string)) => {
      router.injectHtml(html)
    },
    [],
  )
}

export function useDehydrate() {
  const router = useRouter()

  return React.useCallback(function dehydrate<T>(
    key: any,
    data: T | (() => Promise<T> | T),
  ) {
    return router.dehydrateData(key, data)
  },
  [])
}

export function useHydrate() {
  const router = useRouter()

  return function hydrate<T = unknown>(key: any) {
    return router.hydrateData(key) as T
  }
}

function Inner(props: { match: RouteMatch }): any {
  const router = useRouter()
  const route = router.getRoute(props.match.routeId)

  if (props.match.status === 'error') {
    throw props.match.error
  }

  if (props.match.status === 'pending') {
    throw (
      props.match.loadPromise?.then(() => {
        Object.assign(props.match, router.getRouteMatch(props.match.id))
      }) || invariant(false, 'This should never happen')
    )
  }

  if (props.match.status === 'success') {
    let comp = route.options.component ?? router.options.defaultComponent

    if (comp) {
      return React.createElement(comp, {
        useLoader: route.useLoader,
        useMatch: route.useMatch,
        useContext: route.useContext,
        useSearch: route.useSearch,
        useParams: route.useParams,
      })
    }

    return <Outlet />
  }

  invariant(
    false,
    'Idle routeMatch status encountered during rendering! You should never see this. File an issue!',
  )
}

function SafeFragment(props: any) {
  return <>{props.children}</>
}

// This is the messiest thing ever... I'm either seriously tired (likely) or
// there has to be a better way to reset error boundaries when the
// router's location key changes.

class CatchBoundary extends React.Component<{
  children: any
  errorComponent: any
  onCatch: (error: any, info: any) => void
}> {
  state = {
    error: false,
    info: undefined,
  }
  componentDidCatch(error: any, info: any) {
    this.props.onCatch(error, info)
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
  const routerState = useRouterState()
  const [activeErrorState, setActiveErrorState] = React.useState(
    props.errorState,
  )
  const errorComponent = props.errorComponent ?? ErrorComponent
  const prevKeyRef = React.useRef('' as any)

  React.useEffect(() => {
    if (activeErrorState) {
      if (routerState.location.key !== prevKeyRef.current) {
        setActiveErrorState({} as any)
      }
    }

    prevKeyRef.current = routerState.location.key
  }, [activeErrorState, routerState.location.key])

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

export function ErrorComponent({ error }: { error: any }) {
  return (
    <div style={{ padding: '.5rem', maxWidth: '100%' }}>
      <strong style={{ fontSize: '1.2rem' }}>Something went wrong!</strong>
      <div style={{ height: '.5rem' }} />
      <div>
        <pre
          style={{
            fontSize: '.7em',
            border: '1px solid red',
            borderRadius: '.25rem',
            padding: '.5rem',
            color: 'red',
            overflow: 'auto',
          }}
        >
          {error.message ? <code>{error.message}</code> : null}
        </pre>
      </div>
    </div>
  )
}

export function useBlocker(
  message: string,
  condition: boolean | any = true,
): void {
  const router = useRouter()

  React.useEffect(() => {
    if (!condition) return

    let unblock = router.history.block((retry, cancel) => {
      if (window.confirm(message)) {
        unblock()
        retry()
      }
    })

    return unblock
  })
}

export function Block({ message, condition, children }: PromptProps) {
  useBlocker(message, condition)
  return (children ?? null) as ReactNode
}

export function shallow<T>(objA: T, objB: T) {
  if (Object.is(objA, objB)) {
    return true
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false
  }

  const keysA = Object.keys(objA)
  if (keysA.length !== Object.keys(objB).length) {
    return false
  }

  for (let i = 0; i < keysA.length; i++) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, keysA[i] as string) ||
      !Object.is(objA[keysA[i] as keyof T], objB[keysA[i] as keyof T])
    ) {
      return false
    }
  }
  return true
}
