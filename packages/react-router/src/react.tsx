import * as React from 'react'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  LinkOptions,
  ToOptions,
  ResolveRelativePath,
  NavigateOptions,
} from './link'
import {
  AnySearchSchema,
  AnyPathParams,
  AnyContext,
  AnyRoute,
  rootRouteId,
} from './route'
import {
  RoutePaths,
  RouteByPath,
  RouteIds,
  ParseRoute,
  RoutesById,
  RouteById,
  AllParams,
} from './routeInfo'
import { RegisteredRouter, RouterOptions, Router, RouterState } from './router'
import { RouteMatch } from './RouteMatch'
import { NoInfer, functionalUpdate, last } from './utils'
import { MatchRouteOptions, RouterContext } from './RouterProvider'
import { routerContext } from './RouterProvider'

const useLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

export type RouteProps<
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TAllContext extends Record<string, any> = AnyContext,
> = {
  useMatch: <TSelected = TAllContext>(opts?: {
    select?: (search: TAllContext) => TSelected
  }) => TSelected
  useRouteMeta: <TSelected = TAllContext>(opts?: {
    select?: (search: TAllContext) => TSelected
  }) => TSelected
  useSearch: <TSelected = TFullSearchSchema>(opts?: {
    select?: (search: TFullSearchSchema) => TSelected
  }) => TSelected
  useParams: <TSelected = TAllParams>(opts?: {
    select?: (search: TAllParams) => TSelected
  }) => TSelected
}

export type ErrorRouteProps<
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TAllContext extends Record<string, any> = AnyContext,
> = {
  error: unknown
  info: { componentStack: string }
} & RouteProps<TFullSearchSchema, TAllParams, TAllContext>

export type PendingRouteProps<
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TAllContext extends Record<string, any> = AnyContext,
> = RouteProps<TFullSearchSchema, TAllParams, TAllContext>

//

type ReactNode = any

export type SyncRouteComponent<TProps> =
  | ((props: TProps) => ReactNode)
  | React.LazyExoticComponent<(props: TProps) => ReactNode>

export type AsyncRouteComponent<TProps> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export type RouteComponent<
  TFullSearchSchema extends Record<string, any>,
  TAllParams extends AnyPathParams,
  TAllContext extends Record<string, any>,
> = AsyncRouteComponent<RouteProps<TFullSearchSchema, TAllParams, TAllContext>>

export type ErrorRouteComponent<
  TFullSearchSchema extends Record<string, any>,
  TAllParams extends AnyPathParams,
  TAllContext extends Record<string, any>,
> = AsyncRouteComponent<
  ErrorRouteProps<TFullSearchSchema, TAllParams, TAllContext>
>

export type PendingRouteComponent<
  TFullSearchSchema extends Record<string, any>,
  TAllParams extends AnyPathParams,
  TAllContext extends Record<string, any>,
> = AsyncRouteComponent<
  PendingRouteProps<TFullSearchSchema, TAllParams, TAllContext>
>

export type AnyRouteComponent = RouteComponent<any, any, any>

export function lazyRouteComponent<
  T extends Record<string, any>,
  TKey extends keyof T = 'default',
>(
  importer: () => Promise<T>,
  exportName?: TKey,
): T[TKey] extends (props: infer TProps) => any
  ? AsyncRouteComponent<TProps>
  : never {
  let loadPromise: Promise<any>

  const load = () => {
    if (!loadPromise) {
      loadPromise = importer()
    }

    return loadPromise
  }

  const lazyComp = React.lazy(async () => {
    const moduleExports = await load()
    const comp = moduleExports[exportName ?? 'default']
    return {
      default: comp,
    }
  })

  ;(lazyComp as any).preload = load

  return lazyComp as any
}

export type LinkPropsOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = LinkOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
  // If set to `true`, the link's underlying navigate() call will be wrapped in a `React.startTransition` call. Defaults to `true`.
  startTransition?: boolean
}

export type MakeUseMatchRouteOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = ToOptions<AnyRoute, TFrom, TTo, TMaskFrom, TMaskTo> & MatchRouteOptions

export type MakeMatchRouteOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = ToOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
  MatchRouteOptions & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | ((
          params?: RouteByPath<
            TRouteTree,
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['types']['allParams'],
        ) => ReactNode)
      | React.ReactNode
  }

export type MakeLinkPropsOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = LinkPropsOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>

export type MakeLinkOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = LinkPropsOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
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
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
>(
  options: MakeLinkPropsOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
): React.AnchorHTMLAttributes<HTMLAnchorElement> {
  const { buildLink, state: routerState } = useRouter()
  const match = useMatch({
    strict: false,
  })

  const {
    // custom props
    type,
    children,
    target,
    activeProps = () => ({ className: 'active' }),
    inactiveProps = () => ({}),
    activeOptions,
    disabled,
    hash,
    search,
    params,
    to,
    state,
    mask,
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

  const linkInfo = buildLink(routerState, {
    from: options.to ? match.pathname : undefined,
    ...options,
  } as any)

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

  const handleReactClick = (e: Event) => {
    if (options.startTransition ?? true) {
      ;(React.startTransition || ((d) => d))(() => {
        handleClick(e)
      })
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
    href: disabled
      ? undefined
      : next.maskedLocation
      ? next.maskedLocation.href
      : next.href,
    onClick: composeHandlers([onClick, handleReactClick]),
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

export interface LinkComponent<TProps extends Record<string, any> = {}> {
  <
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
    TFrom extends RoutePaths<TRouteTree> = '/',
    TTo extends string = '',
    TMaskFrom extends RoutePaths<TRouteTree> = '/',
    TMaskTo extends string = '',
  >(
    props: MakeLinkOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
      TProps &
      React.RefAttributes<HTMLAnchorElement>,
  ): ReactNode
}

export const Link: LinkComponent = React.forwardRef((props: any, ref) => {
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
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
>(props: NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>): null {
  const { navigate } = useRouter()
  const match = useMatch({ strict: false })

  useLayoutEffect(() => {
    navigate({
      from: props.to ? match.pathname : undefined,
      ...props,
    } as any)
  }, [])

  return null
}

export const matchesContext = React.createContext<RouteMatch[]>(null!)
export type RouterProps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<RouterOptions<TRouteTree, TDehydrated>, 'context'> & {
  router: Router<TRouteTree>
  context?: Partial<RouterOptions<TRouteTree, TDehydrated>['meta']>
}

export function useRouter<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
>(): RouterContext<TRouteTree> {
  const resolvedContext = window.__TSR_ROUTER_CONTEXT__ || routerContext
  const value = React.useContext(resolvedContext)
  warning(value, 'useRouter must be used inside a <RouterProvider> component!')
  return value as any
}

export function useRouterState<
  TSelected = RouterState<RegisteredRouter['routeTree']>,
>(opts?: {
  select: (state: RouterState<RegisteredRouter['routeTree']>) => TSelected
}): TSelected {
  const { state } = useRouter()
  // return useStore(router.__store, opts?.select as any)
  return opts?.select ? opts.select(state) : (state as any)
}

export function useMatches<T = RouteMatch[]>(opts?: {
  select?: (matches: RouteMatch[]) => T
}): T {
  const contextMatches = React.useContext(matchesContext)

  return useRouterState({
    select: (state) => {
      const matches = state.matches.slice(
        state.matches.findIndex((d) => d.id === contextMatches[0]?.id),
      )
      return opts?.select ? opts.select(matches) : (matches as T)
    },
  })
}

type StrictOrFrom<TFrom> =
  | {
      from: TFrom
      strict?: true
    }
  | {
      from?: never
      strict: false
    }

export function useMatch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TRouteMatchState = RouteMatch<TRouteTree, TFrom>,
  TSelected = TRouteMatchState,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (match: TRouteMatchState) => TSelected
  },
): TStrict extends true ? TRouteMatchState : TRouteMatchState | undefined {
  const nearestMatch = React.useContext(matchesContext)[0]!
  const nearestMatchRouteId = nearestMatch?.routeId

  const matchRouteId = useRouterState({
    select: (state) => {
      const match = opts?.from
        ? state.matches.find((d) => d.routeId === opts?.from)
        : state.matches.find((d) => d.id === nearestMatch.id)

      return match!.routeId
    },
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

  const matchSelection = useRouterState({
    select: (state) => {
      const match = opts?.from
        ? state.matches.find((d) => d.routeId === opts?.from)
        : state.matches.find((d) => d.id === nearestMatch.id)

      invariant(
        match,
        `Could not find ${
          opts?.from
            ? `an active match from "${opts.from}"`
            : 'a nearest match!'
        }`,
      )

      return opts?.select ? opts.select(match as any) : match
    },
  })

  return matchSelection as any
}

export type RouteFromIdOrRoute<
  T,
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
> = T extends ParseRoute<TRouteTree>
  ? T
  : T extends RouteIds<TRouteTree>
  ? RoutesById<TRouteTree>[T]
  : T extends string
  ? RouteIds<TRouteTree>
  : never

export function useRouteMeta<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TRouteMeta = RouteById<TRouteTree, TFrom>['types']['allMeta'],
  TSelected = TRouteMeta,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TRouteMeta) => TSelected
  },
): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) =>
      opts?.select ? opts.select(match.meta as TRouteMeta) : match.meta,
  })
}

export function useSearch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TSearch = RouteById<TRouteTree, TFrom>['types']['fullSearchSchema'],
  TSelected = TSearch,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TSearch) => TSelected
  },
): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) => {
      return opts?.select ? opts.select(match.search as TSearch) : match.search
    },
  })
}

export function useParams<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TDefaultSelected = AllParams<TRouteTree> &
    RouteById<TRouteTree, TFrom>['types']['allParams'],
  TSelected = TDefaultSelected,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TDefaultSelected) => TSelected
  },
): TSelected {
  return useRouterState({
    select: (state: any) => {
      const params = (last(state.matches) as any)?.params
      return opts?.select ? opts.select(params) : params
    },
  })
}

export function useNavigate<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDefaultFrom extends RoutePaths<TRouteTree> = '/',
>(defaultOpts?: { from?: TDefaultFrom }) {
  const { navigate } = useRouter()
  const match = useMatch({
    strict: false,
  })
  return React.useCallback(
    <
      TFrom extends RoutePaths<TRouteTree> = TDefaultFrom,
      TTo extends string = '',
      TMaskFrom extends RoutePaths<TRouteTree> = '/',
      TMaskTo extends string = '',
    >(
      opts?: NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
    ) => {
      return navigate({
        from: opts?.to ? match.pathname : undefined,
        ...defaultOpts,
        ...(opts as any),
      })
    },
    [],
  )
}

export function useMatchRoute<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
>() {
  const { state, matchRoute } = useRouter()

  return React.useCallback(
    <
      TFrom extends RoutePaths<TRouteTree> = '/',
      TTo extends string = '',
      TMaskFrom extends RoutePaths<TRouteTree> = '/',
      TMaskTo extends string = '',
      TResolved extends string = ResolveRelativePath<TFrom, NoInfer<TTo>>,
    >(
      opts: MakeUseMatchRouteOptions<
        TRouteTree,
        TFrom,
        TTo,
        TMaskFrom,
        TMaskTo
      >,
    ): false | RouteById<TRouteTree, TResolved>['types']['allParams'] => {
      const { pending, caseSensitive, ...rest } = opts

      return matchRoute(state, rest as any, {
        pending,
        caseSensitive,
      })
    },
    [],
  )
}

export function Matches() {
  const { routesById, state } = useRouter()

  // const matches = useRouterState({
  //   select: (state) => {
  //     return state.matches
  //   },
  // })

  const { matches } = state

  const locationKey = useRouterState({
    select: (d) => d.resolvedLocation.state?.key,
  })

  const route = routesById[rootRouteId]

  const errorComponent = React.useCallback(
    (props: any) => {
      return React.createElement(ErrorComponent, {
        ...props,
        useMatch: route.useMatch,
        useRouteMeta: route.useRouteMeta,
        useSearch: route.useSearch,
        useParams: route.useParams,
      })
    },
    [route],
  )

  return (
    <matchesContext.Provider value={matches}>
      <CatchBoundary
        resetKey={locationKey}
        errorComponent={errorComponent}
        onCatch={() => {
          warning(
            false,
            `Error in router! Consider setting an 'errorComponent' in your RootRoute! 👍`,
          )
        }}
      >
        {matches.length ? <Match matches={matches} /> : null}
      </CatchBoundary>
    </matchesContext.Provider>
  )
}

export function MatchRoute<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
>(
  props: MakeMatchRouteOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
): any {
  const matchRoute = useMatchRoute()
  const params = matchRoute(props as any)

  if (typeof props.children === 'function') {
    return (props.children as any)(params)
  }

  return !!params ? props.children : null
}

export function Outlet() {
  const matches = React.useContext(matchesContext).slice(1)

  if (!matches[0]) {
    return null
  }

  return <Match matches={matches} />
}

const defaultPending = () => null

function Match({ matches }: { matches: RouteMatch[] }) {
  const { options, routesById } = useRouter()
  const match = matches[0]!
  const routeId = match?.routeId
  const route = routesById[routeId]
  const locationKey = useRouterState({
    select: (s) => s.resolvedLocation.state?.key,
  })

  const PendingComponent = (route.options.pendingComponent ??
    options.defaultPendingComponent ??
    defaultPending) as any

  const routeErrorComponent =
    route.options.errorComponent ??
    options.defaultErrorComponent ??
    ErrorComponent

  const ResolvedSuspenseBoundary =
    route.options.wrapInSuspense ?? !route.isRoot
      ? React.Suspense
      : SafeFragment

  const ResolvedCatchBoundary = !!routeErrorComponent
    ? CatchBoundary
    : SafeFragment

  const errorComponent = React.useCallback(
    (props: any) => {
      return React.createElement(routeErrorComponent, {
        ...props,
        useMatch: route.useMatch,
        useRouteMeta: route.useRouteMeta,
        useSearch: route.useSearch,
        useParams: route.useParams,
      })
    },
    [route],
  )

  return (
    <matchesContext.Provider value={matches}>
      <ResolvedSuspenseBoundary
        fallback={React.createElement(PendingComponent, {
          useMatch: route.useMatch,
          useRouteMeta: route.useRouteMeta,
          useSearch: route.useSearch,
          useParams: route.useParams,
        })}
      >
        <ResolvedCatchBoundary
          resetKey={locationKey}
          errorComponent={errorComponent}
          onCatch={() => {
            warning(false, `Error in route match: ${match.id}`)
          }}
        >
          <MatchInner match={match} />
        </ResolvedCatchBoundary>
      </ResolvedSuspenseBoundary>
    </matchesContext.Provider>
  )
}

function MatchInner({ match }: { match: RouteMatch }): any {
  const { options, routesById } = useRouter()
  const route = routesById[match.routeId]

  if (match.status === 'error') {
    throw match.error
  }

  if (match.status === 'pending') {
    throw match.loadPromise
  }

  if (match.status === 'success') {
    let comp = route.options.component ?? options.defaultComponent

    if (comp) {
      return React.createElement(comp, {
        useMatch: route.useMatch,
        useRouteMeta: route.useRouteMeta as any,
        useSearch: route.useSearch,
        useParams: route.useParams as any,
      } as any)
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

// export function useInjectHtml() {
//   const { } = useRouter()

//   return React.useCallback(
//     (html: string | (() => Promise<string> | string)) => {
//       router.injectHtml(html)
//     },
//     [],
//   )
// }

// export function useDehydrate() {
//   const { } = useRouter()

//   return React.useCallback(function dehydrate<T>(
//     key: any,
//     data: T | (() => Promise<T> | T),
//   ) {
//     return router.dehydrateData(key, data)
//   },
//   [])
// }

// export function useHydrate() {
//   const { } = useRouter()

//   return function hydrate<T = unknown>(key: any) {
//     return router.hydrateData(key) as T
//   }
// }

// This is the messiest thing ever... I'm either seriously tired (likely) or
// there has to be a better way to reset error boundaries when the
// router's location key changes.

export function CatchBoundary(props: {
  resetKey: string
  children: any
  errorComponent?: any
  onCatch: (error: any) => void
}) {
  const errorComponent = props.errorComponent ?? ErrorComponent

  return (
    <CatchBoundaryImpl
      resetKey={props.resetKey}
      onCatch={props.onCatch}
      children={({ error }) => {
        if (error) {
          return React.createElement(errorComponent, {
            error,
          })
        }

        return props.children
      }}
    />
  )
}

export class CatchBoundaryImpl extends React.Component<{
  resetKey: string
  children: (props: { error: any; reset: () => void }) => any
  onCatch?: (error: any) => void
}> {
  state = { error: null } as any
  static getDerivedStateFromError(error: any) {
    return { error }
  }
  componentDidUpdate(
    prevProps: Readonly<{
      resetKey: string
      children: (props: { error: any; reset: () => void }) => any
      onCatch?: ((error: any, info: any) => void) | undefined
    }>,
    prevState: any,
  ): void {
    if (prevState.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }
  componentDidCatch(error: any) {
    this.props.onCatch?.(error)
  }
  render() {
    return this.props.children(this.state)
  }
}

export function ErrorComponent({ error }: { error: any }) {
  const [show, setShow] = React.useState(process.env.NODE_ENV !== 'production')

  return (
    <div style={{ padding: '.5rem', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <strong style={{ fontSize: '1rem' }}>Something went wrong!</strong>
        <button
          style={{
            appearance: 'none',
            fontSize: '.6em',
            border: '1px solid currentColor',
            padding: '.1rem .2rem',
            fontWeight: 'bold',
            borderRadius: '.25rem',
          }}
          onClick={() => setShow((d) => !d)}
        >
          {show ? 'Hide Error' : 'Show Error'}
        </button>
      </div>
      <div style={{ height: '.25rem' }} />
      {show ? (
        <div>
          <pre
            style={{
              fontSize: '.7em',
              border: '1px solid red',
              borderRadius: '.25rem',
              padding: '.3rem',
              color: 'red',
              overflow: 'auto',
            }}
          >
            {error.message ? <code>{error.message}</code> : null}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

export function useBlocker(
  message: string,
  condition: boolean | any = true,
): void {
  const { history } = useRouter()

  React.useEffect(() => {
    if (!condition) return

    let unblock = history.block((retry, cancel) => {
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
