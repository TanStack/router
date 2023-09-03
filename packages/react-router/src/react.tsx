import * as React from 'react'
import { NoInfer, useStore } from '@tanstack/react-store'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  functionalUpdate,
  last,
  pick,
  MatchRouteOptions,
  RegisteredRouter,
  RouterOptions,
  Router,
  RouteMatch,
  RouteByPath,
  AnyRoute,
  AnyRouteProps,
  LinkOptions,
  ToOptions,
  ResolveRelativePath,
  NavigateOptions,
  ResolveFullPath,
  ResolveId,
  AnySearchSchema,
  ParsePathParams,
  MergeParamsFromParent,
  RouteContext,
  AnyContext,
  UseLoaderResult,
  ResolveFullSearchSchema,
  Route,
  RouteConstraints,
  RoutePaths,
  RoutesById,
  RouteIds,
  RouteById,
  ParseRoute,
  AllParams,
  rootRouteId,
  AnyPathParams,
} from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  interface RegisterRouteComponent<
    TLoader = unknown,
    TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
    TAllParams extends AnyPathParams = AnyPathParams,
    TRouteContext extends AnyContext = AnyContext,
    TAllContext extends AnyContext = AnyContext,
  > {
    RouteComponent: RouteComponent<
      RouteProps<
        TLoader,
        TFullSearchSchema,
        TAllParams,
        TRouteContext,
        TAllContext
      >
    >
  }

  interface RegisterErrorRouteComponent<
    TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
    TAllParams extends AnyPathParams = AnyPathParams,
    TRouteContext extends AnyContext = AnyContext,
    TAllContext extends AnyContext = AnyContext,
  > {
    ErrorRouteComponent: RouteComponent<
      ErrorRouteProps<TFullSearchSchema, TAllParams, TRouteContext, TAllContext>
    >
  }

  interface RegisterPendingRouteComponent<
    TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
    TAllParams extends AnyPathParams = AnyPathParams,
    TRouteContext extends AnyContext = AnyContext,
    TAllContext extends AnyContext = AnyContext,
  > {
    PendingRouteComponent: RouteComponent<
      PendingRouteProps<
        TFullSearchSchema,
        TAllParams,
        TRouteContext,
        TAllContext
      >
    >
  }

  interface Route<
    TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
    TPath extends RouteConstraints['TPath'] = '/',
    TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
      TParentRoute,
      TPath
    >,
    TCustomId extends RouteConstraints['TCustomId'] = string,
    TId extends RouteConstraints['TId'] = ResolveId<
      TParentRoute,
      TCustomId,
      TPath
    >,
    TLoader = unknown,
    TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
    TFullSearchSchema extends RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchema<
      TParentRoute,
      TSearchSchema
    >,
    TParams extends RouteConstraints['TParams'] = Record<
      ParsePathParams<TPath>,
      string
    >,
    TAllParams extends RouteConstraints['TAllParams'] = MergeParamsFromParent<
      TParentRoute['types']['allParams'],
      TParams
    >,
    TParentContext extends RouteConstraints['TParentContext'] = TParentRoute['types']['routeContext'],
    TAllParentContext extends RouteConstraints['TAllParentContext'] = TParentRoute['types']['context'],
    TRouteContext extends RouteConstraints['TRouteContext'] = RouteContext,
    TAllContext extends RouteConstraints['TAllContext'] = MergeParamsFromParent<
      TParentRoute['types']['context'],
      TRouteContext
    >,
    TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
    TChildren extends RouteConstraints['TChildren'] = unknown,
    TRouteTree extends RouteConstraints['TRouteTree'] = AnyRoute,
  > {
    useMatch: <TSelected = TAllContext>(opts?: {
      select?: (search: TAllContext) => TSelected
    }) => TSelected
    useLoader: <TSelected = TLoader>(opts?: {
      select?: (search: TLoader) => TSelected
    }) => UseLoaderResult<TSelected>
    useContext: <TSelected = TAllContext>(opts?: {
      select?: (search: TAllContext) => TSelected
    }) => TSelected
    useRouteContext: <TSelected = TRouteContext>(opts?: {
      select?: (search: TRouteContext) => TSelected
    }) => TSelected
    useSearch: <TSelected = TFullSearchSchema>(opts?: {
      select?: (search: TFullSearchSchema) => TSelected
    }) => TSelected
    useParams: <TSelected = TAllParams>(opts?: {
      select?: (search: TAllParams) => TSelected
    }) => TSelected
  }

  interface RegisterRouteProps<
    TLoader = unknown,
    TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
    TAllParams extends AnyPathParams = AnyPathParams,
    TRouteContext extends AnyContext = AnyContext,
    TAllContext extends AnyContext = AnyContext,
  > {
    RouteProps: RouteProps<
      TLoader,
      TFullSearchSchema,
      TAllParams,
      TRouteContext,
      TAllContext
    >
  }

  interface RegisterPendingRouteProps<
    TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
    TAllParams extends AnyPathParams = AnyPathParams,
    TRouteContext extends AnyContext = AnyContext,
    TAllContext extends AnyContext = AnyContext,
  > {
    PendingRouteProps: PendingRouteProps<
      TFullSearchSchema,
      TAllParams,
      TRouteContext,
      TAllContext
    >
  }

  interface RegisterErrorRouteProps<
    TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
    TAllParams extends AnyPathParams = AnyPathParams,
    TRouteContext extends AnyContext = AnyContext,
    TAllContext extends AnyContext = AnyContext,
  > {
    ErrorRouteProps: ErrorRouteProps
  }
}

export type RouteProps<
  TLoader = unknown,
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = {
  useLoader: <TSelected = TLoader>(opts?: {
    select?: (search: TLoader) => TSelected
  }) => UseLoaderResult<TSelected>
  useMatch: <TSelected = TAllContext>(opts?: {
    select?: (search: TAllContext) => TSelected
  }) => TSelected
  useContext: <TSelected = TAllContext>(opts?: {
    select?: (search: TAllContext) => TSelected
  }) => TSelected
  useRouteContext: <TSelected = TRouteContext>(opts?: {
    select?: (search: TRouteContext) => TSelected
  }) => TSelected
  useSearch: <TSelected = TFullSearchSchema>(opts?: {
    select?: (search: TFullSearchSchema) => TSelected
  }) => TSelected
  useParams: <TSelected = TAllParams>(opts?: {
    select?: (search: TAllParams) => TSelected
  }) => TSelected
}

export type ErrorRouteProps<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = {
  error: unknown
  info: { componentStack: string }
} & Omit<
  RouteProps<
    unknown,
    TFullSearchSchema,
    TAllParams,
    TRouteContext,
    TAllContext
  >,
  'useLoader'
>

export type PendingRouteProps<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = Omit<
  RouteProps<
    unknown,
    TFullSearchSchema,
    TAllParams,
    TRouteContext,
    TAllContext
  >,
  'useLoader'
>

Route.__onInit = (route) => {
  Object.assign(route, {
    useMatch: (opts = {}) => {
      return useMatch({ ...opts, from: route.id }) as any
    },
    useLoader: (opts = {}) => {
      return useLoader({ ...opts, from: route.id }) as any
    },
    useContext: (opts: any = {}) => {
      return useMatch({
        ...opts,
        from: route.id,
        select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
      } as any)
    },
    useRouteContext: (opts: any = {}) => {
      return useMatch({
        ...opts,
        from: route.id,
        select: (d: any) =>
          opts?.select ? opts.select(d.routeContext) : d.routeContext,
      } as any)
    },
    useSearch: (opts = {}) => {
      return useSearch({ ...opts, from: route.id } as any)
    },
    useParams: (opts = {}) => {
      return useParams({ ...opts, from: route.id } as any)
    },
  })
}

//

type ReactNode = any

export type SyncRouteComponent<TProps> =
  | ((props: TProps) => ReactNode)
  | React.LazyExoticComponent<(props: TProps) => ReactNode>

export type AsyncRouteComponent<TProps> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export type ErrorRouteComponent = AsyncRouteComponent<ErrorRouteComponentProps>

export type ErrorRouteComponentProps = {
  error: Error
  info: { componentStack: string }
}

export type AnyRouteComponent = RouteComponent<AnyRouteProps>

export type RouteComponent<TProps> = AsyncRouteComponent<TProps>

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
  TFrom extends RoutePaths<RegisteredRouter['routeTree']> = '/',
  TTo extends string = '',
> = LinkOptions<RegisteredRouter['routeTree'], TFrom, TTo> & {
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
  TFrom extends RoutePaths<RegisteredRouter['routeTree']> = '/',
  TTo extends string = '',
> = ToOptions<RegisteredRouter['routeTree'], TFrom, TTo> & MatchRouteOptions

export type MakeMatchRouteOptions<
  TFrom extends RoutePaths<RegisteredRouter['routeTree']> = '/',
  TTo extends string = '',
> = ToOptions<RegisteredRouter['routeTree'], TFrom, TTo> &
  MatchRouteOptions & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | ((
          params?: RouteByPath<
            RegisteredRouter['routeTree'],
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['types']['allParams'],
        ) => ReactNode)
      | React.ReactNode
  }

export type MakeLinkPropsOptions<
  TFrom extends string = '/',
  TTo extends string = '',
> = LinkPropsOptions<TFrom, TTo> & React.AnchorHTMLAttributes<HTMLAnchorElement>

export type MakeLinkOptions<
  TFrom extends RoutePaths<RegisteredRouter['routeTree']> = '/',
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
    href: disabled ? undefined : next.href,
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
    TFrom extends RoutePaths<RegisteredRouter['routeTree']> = '/',
    TTo extends string = '',
  >(
    props: MakeLinkOptions<TFrom, TTo> &
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
  TFrom extends RoutePaths<RegisteredRouter['routeTree']> = '/',
  TTo extends string = '',
>(props: NavigateOptions<RegisteredRouter['routeTree'], TFrom, TTo>): null {
  const router = useRouter()

  React.useLayoutEffect(() => {
    router.navigate(props as any)
  }, [])

  return null
}

export const matchIdsContext = React.createContext<string[]>(null!)
export const routerContext = React.createContext<RegisteredRouter>(null!)

export type RouterProps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<RouterOptions<TRouteTree, TDehydrated>, 'context'> & {
  router: Router<TRouteTree>
  context?: Partial<RouterOptions<TRouteTree, TDehydrated>['context']>
}

export function useRouterState<TSelected = RegisteredRouter['state']>(opts?: {
  select: (state: RegisteredRouter['state']) => TSelected
}): TSelected {
  const router = useRouter()
  return useStore(router.__store, opts?.select as any)
}

export function RouterProvider<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouteTree, TDehydrated>) {
  router.update(rest)

  React.useEffect(() => {
    let unsub

    React.startTransition(() => {
      unsub = router.mount()
    })

    return unsub
  }, [router])

  const Wrap = router.options.Wrap || React.Fragment

  return (
    <Wrap>
      <routerContext.Provider value={router as any}>
        <Matches />
      </routerContext.Provider>
    </Wrap>
  )
}

function Matches() {
  const router = useRouter()

  const matchIds = useRouterState({
    select: (state) => {
      return state.renderedMatchIds
    },
  })

  return (
    <matchIdsContext.Provider value={[undefined!, ...matchIds]}>
      <CatchBoundary
        errorComponent={ErrorComponent}
        route={router.getRoute(rootRouteId)}
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
}): T {
  const matchIds = React.useContext(matchIdsContext)

  return useRouterState({
    select: (state) => {
      const matches = state.renderedMatches.slice(
        state.renderedMatches.findIndex((d) => d.id === matchIds[0]),
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
  TFrom extends RouteIds<RegisteredRouter['routeTree']>,
  TStrict extends boolean = true,
  TRouteMatchState = RouteMatch<
    RegisteredRouter['routeTree'],
    RouteById<RegisteredRouter['routeTree'], TFrom>
  >,
  TSelected = TRouteMatchState,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (match: TRouteMatchState) => TSelected
  },
): TStrict extends true ? TRouteMatchState : TRouteMatchState | undefined {
  const router = useRouter()
  const nearestMatchId = React.useContext(matchIdsContext)[0]!
  const nearestMatchRouteId = router.getRouteMatch(nearestMatchId)?.routeId

  const matchRouteId = useRouterState({
    select: (state) => {
      const match = opts?.from
        ? state.renderedMatches.find((d) => d.routeId === opts?.from)
        : state.renderedMatches.find((d) => d.id === nearestMatchId)

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
        ? state.renderedMatches.find((d) => d.routeId === opts?.from)
        : state.renderedMatches.find((d) => d.id === nearestMatchId)

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

export type RouteFromIdOrRoute<T> = T extends ParseRoute<
  RegisteredRouter['routeTree']
>
  ? T
  : T extends RouteIds<RegisteredRouter['routeTree']>
  ? RoutesById<RegisteredRouter['routeTree']>[T]
  : T extends string
  ? RouteIds<RegisteredRouter['routeTree']>
  : never

export function useLoader<
  TFrom extends RouteIds<RegisteredRouter['routeTree']>,
  TStrict extends boolean = true,
  TLoader = RouteById<RegisteredRouter['routeTree'], TFrom>['types']['loader'],
  TSelected = TLoader,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TLoader) => TSelected
  },
): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) =>
      opts?.select
        ? opts?.select(match.loaderData as TLoader)
        : match.loaderData,
  })
}

export function useRouterContext<
  TFrom extends RouteIds<RegisteredRouter['routeTree']>,
  TStrict extends boolean = true,
  TContext = RouteById<
    RegisteredRouter['routeTree'],
    TFrom
  >['types']['context'],
  TSelected = TContext,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TContext) => TSelected
  },
): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) =>
      opts?.select ? opts.select(match.context as TContext) : match.context,
  })
}

export function useRouteContext<
  TFrom extends RouteIds<RegisteredRouter['routeTree']>,
  TStrict extends boolean = true,
  TRouteContext = RouteById<
    RegisteredRouter['routeTree'],
    TFrom
  >['types']['routeContext'],
  TSelected = TRouteContext,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TRouteContext) => TSelected
  },
): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) =>
      opts?.select
        ? opts.select(match.routeContext as TRouteContext)
        : match.routeContext,
  })
}

export function useSearch<
  TFrom extends RouteIds<RegisteredRouter['routeTree']>,
  TStrict extends boolean = true,
  TSearch = RouteById<
    RegisteredRouter['routeTree'],
    TFrom
  >['types']['fullSearchSchema'],
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
  TFrom extends RouteIds<RegisteredRouter['routeTree']> = '/',
  TDefaultSelected = AllParams<RegisteredRouter['routeTree']> &
    RouteById<RegisteredRouter['routeTree'], TFrom>['types']['allParams'],
  TSelected = TDefaultSelected,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TDefaultSelected) => TSelected
  },
): TSelected {
  return useRouterState({
    select: (state: any) => {
      const params = (last(state.renderedMatches) as any)?.params
      return opts?.select ? opts.select(params) : params
    },
  })
}

export function useNavigate<
  TDefaultFrom extends RoutePaths<RegisteredRouter['routeTree']> = '/',
>(defaultOpts?: { from?: TDefaultFrom }) {
  const router = useRouter()
  return React.useCallback(
    <
      TFrom extends RoutePaths<RegisteredRouter['routeTree']> = TDefaultFrom,
      TTo extends string = '',
    >(
      opts?: NavigateOptions<RegisteredRouter['routeTree'], TFrom, TTo>,
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
    route.options.errorComponent ??
    router.options.defaultErrorComponent ??
    ErrorComponent

  const ResolvedSuspenseBoundary =
    route.options.wrapInSuspense ?? !route.isRoot
      ? React.Suspense
      : SafeFragment

  const ResolvedCatchBoundary = !!errorComponent ? CatchBoundary : SafeFragment

  return (
    <matchIdsContext.Provider value={matchIds}>
      <ResolvedSuspenseBoundary
        fallback={React.createElement(PendingComponent, {
          useMatch: route.useMatch,
          useContext: route.useContext,
          useRouteContext: route.useRouteContext,
          useSearch: route.useSearch,
          useParams: route.useParams,
        })}
      >
        <ResolvedCatchBoundary
          key={route.id}
          errorComponent={errorComponent}
          route={route}
          onCatch={() => {
            warning(false, `Error in route match: ${matchId}`)
          }}
        >
          <MatchInner matchId={matchId} PendingComponent={PendingComponent} />
        </ResolvedCatchBoundary>
      </ResolvedSuspenseBoundary>
    </matchIdsContext.Provider>
  )
}

function MatchInner({
  matchId,
  PendingComponent,
}: {
  matchId: string
  PendingComponent: any
}): any {
  const router = useRouter()

  const match = useRouterState({
    select: (d) => {
      const match = d.matchesById[matchId]
      return pick(match!, ['status', 'loadPromise', 'routeId', 'error'])
    },
  })

  const route = router.getRoute(match.routeId)

  if (match.status === 'error') {
    throw match.error
  }

  if (match.status === 'pending') {
    return React.createElement(PendingComponent, {
      useLoader: route.useLoader,
      useMatch: route.useMatch,
      useContext: route.useContext,
      useRouteContext: route.useRouteContext,
      useSearch: route.useSearch,
      useParams: route.useParams,
    })
  }

  if (match.status === 'success') {
    let comp = route.options.component ?? router.options.defaultComponent

    if (comp) {
      return React.createElement(comp, {
        useLoader: route.useLoader,
        useMatch: route.useMatch,
        useContext: route.useContext as any,
        useRouteContext: route.useRouteContext as any,
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
  route: AnyRoute
  onCatch: (error: any, info: any) => void
}> {
  state = {
    error: false,
    info: undefined,
  }
  componentDidCatch(error: any, info: any) {
    this.props.onCatch(error, info)
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
  route: AnyRoute
  errorState: { error: unknown; info: any }
  reset: () => void
}) {
  const locationKey = useRouterState({
    select: (d) => d.resolvedLocation.key,
  })

  const [activeErrorState, setActiveErrorState] = React.useState(
    props.errorState,
  )
  const errorComponent = props.errorComponent ?? ErrorComponent
  const prevKeyRef = React.useRef('' as any)

  React.useEffect(() => {
    if (activeErrorState) {
      if (locationKey !== prevKeyRef.current) {
        setActiveErrorState({} as any)
      }
    }

    prevKeyRef.current = locationKey
  }, [activeErrorState, locationKey])

  React.useEffect(() => {
    if (props.errorState.error) {
      setActiveErrorState(props.errorState)
    }
    // props.reset()
  }, [props.errorState.error])

  if (props.errorState.error && activeErrorState.error) {
    return React.createElement(errorComponent, {
      ...activeErrorState,
      useMatch: props.route.useMatch,
      useContext: props.route.useContext,
      useRouteContext: props.route.useRouteContext,
      useSearch: props.route.useSearch,
      useParams: props.route.useParams,
    })
  }

  return props.children
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
