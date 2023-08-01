import * as React from 'react'
import { NoInfer, useStore } from '@tanstack/react-store'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
// @ts-ignore
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
import { functionalUpdate, last, pick } from './utils'

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
      | ((
          params?: RouteByPath<
            RegisteredRoutesInfo,
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['__types']['allParams'],
        ) => ReactNode)
      | React.ReactNode
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
    onClick: composeHandlers([onClick, handleClick]),
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

export const matchIdsContext = React.createContext<string[]>(null!)
export const routerContext = React.createContext<RegisteredRouter>(null!)

export type RouterProps<
  TRouteConfig extends AnyRoute = AnyRoute,
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<RouterOptions<TRouteConfig, TDehydrated>, 'context'> & {
  router: Router<TRouteConfig, TRoutesInfo>
  context?: Partial<RouterOptions<TRouteConfig, TDehydrated>['context']>
}

const useLayoutEffect =
  typeof document === 'undefined' ? React.useEffect : React.useLayoutEffect

export function RouterProvider<
  TRouteConfig extends AnyRoute = AnyRoute,
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouteConfig, TRoutesInfo, TDehydrated>) {
  router.update(rest)

  React.useEffect(router.mount, [router])

  const Wrap = router.options.Wrap || React.Fragment

  return (
    <Wrap>
      <routerContext.Provider value={router as any}>
        <Matches />
      </routerContext.Provider>
    </Wrap>
  )
}

export function useRouterState<T = RegisteredRouter['state']>(
  select?: (state: RegisteredRouter['state']) => T,
  track?: (state: NoInfer<T>) => any,
): T {
  const router = useRouter()
  const [state, _setState] = React.useState<T>(
    () => select?.(router.state) ?? (router.state as T),
  )
  const [tracked, _setTracked] = React.useState<T>(() => track?.(state))
  const [, startTransition] = React.useTransition()

  useLayoutEffect(() => {
    return router.__store.subscribe((ctx) => {
      Promise.resolve().then(() => {
        // shallow compare
        const nextState = (select?.(router.state) ?? state) as T
        const nextTracked = (track?.(nextState) ?? nextState) as T

        if (!shallow(tracked, nextTracked)) {
          if (ctx.priority === 'low') {
            startTransition(() => {
              _setState(nextState)
              _setTracked(nextTracked)
            })
          } else {
            _setState(nextState)
            _setTracked(nextTracked)
          }
        }
      })
    })
  }, [state])

  return state as T
}

function Matches() {
  const matchIds = useRouterState((d) => d.matches.map((d) => d.id))

  return (
    <matchIdsContext.Provider value={[undefined!, ...matchIds]}>
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
    </matchIdsContext.Provider>
  )
}

export function useRouter(): RegisteredRouter {
  const value = React.useContext(routerContext)
  warning(value, 'useRouter must be used inside a <Router> component!')
  return value
}

export function useMatches<T = RouteMatch[]>(opts?: {
  select?: (matches: RouteMatch[]) => T
  track?: (matches: T) => any
}): T {
  const matchIds = React.useContext(matchIdsContext)
  return useRouterState((state) => {
    const matches = state.matches.slice(
      state.matches.findIndex((d) => d.id === matchIds[0]),
    )

    return (opts?.select?.(matches) ?? matches) as T
  }, opts?.track)
}

export function useMatch<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TRouteMatchState = RouteMatch<
    RegisteredRoutesInfo,
    RegisteredRoutesInfo['routesById'][TFrom]
  >,
  TSelected = TRouteMatchState,
>(opts?: {
  from: TFrom
  strict?: TStrict
  select?: (match: TRouteMatchState) => TSelected
  track?: (match: NoInfer<TSelected>) => any
}): TStrict extends true ? TRouteMatchState : TRouteMatchState | undefined {
  const nearestMatchId = React.useContext(matchIdsContext)[0]
  const nearestMatchRouteId = useRouterState((d) =>
    d.matches.find((d) => d.id === nearestMatchId),
  )?.routeId

  const matchRouteId = useRouterState((state) => {
    const matches = state.matches
    const match = opts?.from
      ? matches.find((d) => d.routeId === opts?.from)
      : matches.find((d) => d.id === nearestMatchId)

    return match!.routeId
  })

  if (opts?.strict ?? true) {
    invariant(
      nearestMatchRouteId == matchRouteId,
      `useMatch("${
        matchRouteId as string
      }") is being called in a component that is meant to render the '${nearestMatchRouteId}' route. Did you mean to 'useMatch("${
        matchRouteId as string
      }", { strict: false })' or 'useRoute("${
        matchRouteId as string
      }")' instead?`,
    )
  }

  const match = useRouterState((state) => {
    const matches = state.matches
    const match = opts?.from
      ? matches.find((d) => d.routeId === opts?.from)
      : matches.find((d) => d.id === nearestMatchId)

    invariant(
      match,
      `Could not find ${
        opts?.from ? `an active match from "${opts.from}"` : 'a nearest match!'
      }`,
    )

    return (opts?.select?.(match as any) ?? match) as TSelected
  }, opts?.track)

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
  select?: (search: TLoader) => TSelected
  track?: (search: TSelected) => any
}): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) =>
      (opts?.select?.(match.loader as TLoader) ?? match.loader) as TSelected,
  })
}

export function useSearch<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TSearch = RegisteredRoutesInfo['routesById'][TFrom]['__types']['fullSearchSchema'],
  TSelected = TSearch,
>(opts?: {
  from: TFrom
  strict?: TStrict
  select?: (search: TSearch) => TSelected
  track?: (search: NoInfer<TSelected>) => any
}): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) => {
      return (opts?.select?.(match.search as TSearch) ??
        match.search) as TSelected
    },
  })
}

export function useParams<
  TFrom extends keyof RegisteredRoutesInfo['routesById'] = '/',
  TDefaultSelected = RegisteredRoutesInfo['allParams'] &
    RegisteredRoutesInfo['routesById'][TFrom]['__types']['allParams'],
  TSelected = TDefaultSelected,
>(opts?: {
  from: TFrom
  select?: (search: TDefaultSelected) => TSelected
  track?: (search: NoInfer<TSelected>) => any
}): TSelected {
  return useRouterState({
    ...(opts as any),
    select: (state: any) => {
      const params = (last(state.matches) as any)?.params
      return (opts?.select?.(params) ?? params) as TSelected
    },
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

  if (typeof props.children === 'function') {
    return (props.children as any)(params)
  }

  return !!params ? props.children : null
}

export function Outlet() {
  const matchIds = React.useContext(matchIdsContext).slice(1)

  if (!matchIds[0]) {
    return null
  }

  return <Match matchIds={matchIds} />
}

const defaultPending = () => null

function Match({ matchIds }: { matchIds: string[] }) {
  const router = useRouter()
  const matchId = matchIds[0]!
  const routeId = router.getRouteMatch(matchId)!.routeId
  const route = router.getRoute(routeId)

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
    <matchIdsContext.Provider value={matchIds}>
      <ResolvedSuspenseBoundary fallback={<PendingComponent />}>
        <ResolvedCatchBoundary
          key={route.id}
          errorComponent={errorComponent}
          onCatch={() => {
            warning(false, `Error in route match: ${matchId}`)
          }}
        >
          <MatchInner matchId={matchId} />
        </ResolvedCatchBoundary>
      </ResolvedSuspenseBoundary>
    </matchIdsContext.Provider>
  )
}

function MatchInner({ matchId }: { matchId: string }): any {
  const router = useRouter()

  const match = useRouterState((d) =>
    pick(d.matches.find((d) => d.id === matchId)!, [
      'status',
      'loadPromise',
      'routeId',
      'error',
    ]),
  )

  const route = router.getRoute(match.routeId)

  if (match.status === 'error') {
    throw match.error
  }

  if (match.status === 'pending') {
    throw (
      match.loadPromise?.then(() => {
        Object.assign(match, router.getRouteMatch(matchId))
      }) || invariant(false, 'This should never happen')
    )
  }

  if (match.status === 'success') {
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
