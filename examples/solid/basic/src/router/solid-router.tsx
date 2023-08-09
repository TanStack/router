// -------------------------- Core Imports -------------------
import {
  AnyContext,
  AnyRoute,
  AnyRouteProps,
  AnyRoutesInfo,
  AnySearchSchema,
  DefaultRoutesInfo,
  LinkOptions,
  MatchRouteOptions,
  MergeParamsFromParent,
  NavigateOptions,
  NoInfer,
  ParsePathParams,
  RegisteredRouter,
  RegisteredRoutesInfo,
  ResolveFullPath,
  ResolveFullSearchSchema,
  ResolveId,
  ResolveRelativePath,
  Route,
  RouteByPath,
  RouteContext,
  RouteMatch,
  Router,
  RouterOptions,
  ToOptions,
  UseLoaderResult,
  functionalUpdate,
  last,
  pick,
} from '@tanstack/router-core'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'

// -------------------------- Store -------------------
import { useStore } from './store'

// -------------------------- Solid Imports -------------------
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'

import {
  ErrorBoundary,
  JSX,
  JSXElement,
  ParentComponent,
  Show,
  Match as SolidMatch,
  Suspense,
  Switch,
  createContext,
  createEffect,
  createRenderEffect,
  createSignal,
  lazy,
  splitProps,
  startTransition,
  useContext,
} from 'solid-js'

// -------------------------- Core Exports -------------------
export * from '@tanstack/router-core'
export { useStore }

declare module '@tanstack/router-core' {
  export interface RegisterRouteComponent<TProps extends Record<string, any>> {
    RouteComponent: RouteComponent<TProps>
  }
  export interface RegisterRouteErrorComponent<
    TProps extends Record<string, any>,
  > {
    RouteComponent: RouteComponent<TProps>
  }
  // Extend the Route class to have some React-Specific methods
  export interface Route<
    TParentRoute extends AnyRoute = AnyRoute,
    TPath extends string = '/',
    TFullPath extends ResolveFullPath<TParentRoute, TPath> = ResolveFullPath<
      TParentRoute,
      TPath
    >,
    TCustomId extends string = string,
    TId extends ResolveId<TParentRoute, TCustomId, TPath> = ResolveId<
      TParentRoute,
      TCustomId,
      TPath
    >,
    TLoader = unknown,
    TSearchSchema extends AnySearchSchema = {},
    TFullSearchSchema extends AnySearchSchema = ResolveFullSearchSchema<
      TParentRoute,
      TSearchSchema
    >,
    TParams extends Record<ParsePathParams<TPath>, any> = Record<
      ParsePathParams<TPath>,
      string
    >,
    TAllParams extends MergeParamsFromParent<
      TParentRoute['__types']['allParams'],
      TParams
    > = MergeParamsFromParent<TParentRoute['__types']['allParams'], TParams>,
    TParentContext extends TParentRoute['__types']['routeContext'] = TParentRoute['__types']['routeContext'],
    TAllParentContext extends TParentRoute['__types']['context'] = TParentRoute['__types']['context'],
    TRouteContext extends RouteContext = RouteContext,
    TContext extends MergeParamsFromParent<
      TParentRoute['__types']['context'],
      TRouteContext
    > = MergeParamsFromParent<
      TParentRoute['__types']['context'],
      TRouteContext
    >,
    TRouterContext extends AnyContext = AnyContext,
    TChildren extends unknown = unknown,
    TRoutesInfo extends DefaultRoutesInfo = DefaultRoutesInfo,
  > {
    useMatch: <TStrict extends boolean = true, TSelected = TContext>(opts?: {
      strict?: TStrict
      select?: (search: TContext) => TSelected
    }) => TStrict extends true ? TSelected : TSelected | undefined
    useLoader: <TStrict extends boolean = true, TSelected = TLoader>(opts?: {
      strict?: TStrict
      select?: (search: TLoader) => TSelected
    }) => TStrict extends true
      ? UseLoaderResult<TSelected>
      : UseLoaderResult<TSelected> | undefined
    useContext: <TStrict extends boolean = true, TSelected = TContext>(opts?: {
      strict?: TStrict
      select?: (search: TContext) => TSelected
    }) => TStrict extends true ? TSelected : TSelected | undefined
    useRouteContext: <
      TStrict extends boolean = true,
      TSelected = TRouteContext,
    >(opts?: {
      strict?: TStrict
      select?: (search: TRouteContext) => TSelected
    }) => TStrict extends true ? TSelected : TSelected | undefined
    useSearch: <
      TStrict extends boolean = true,
      TSelected = TFullSearchSchema,
    >(opts?: {
      strict?: TStrict
      select?: (search: TFullSearchSchema) => TSelected
    }) => TStrict extends true ? TSelected : TSelected | undefined
    useParams: <TStrict extends boolean = true, TSelected = TAllParams>(opts?: {
      strict?: TStrict
      select?: (search: TAllParams) => TSelected
    }) => TStrict extends true ? TSelected : TSelected | undefined
  }
}

Route.__onInit = (route: any) => {
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
        select: (d: any) => opts?.select?.(d.context) ?? d.context,
      } as any)
    },
    useRouteContext: (opts: any = {}) => {
      return useMatch({
        ...opts,
        from: route.id,
        select: (d: any) => opts?.select?.(d.routeContext) ?? d.routeContext,
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

// -------------------------- Route Primitives -------------------
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
}): TStrict extends true ? TRouteMatchState : TRouteMatchState | undefined {
  const router = useRouter()
  const matchIds = useContext(matchIdsContext)!
  const nearestMatchId = () => matchIds[0]!
  const nearestMatchRouteId = () =>
    router.getRouteMatch(nearestMatchId())?.routeId

  const matchRouteId = useRouterState({
    select: (state) => {
      const matches = state.matches
      const match = opts?.from
        ? matches.find((d) => d.routeId === opts?.from)
        : matches.find((d) => d.id === nearestMatchId())

      return match!.routeId
    },
  })

  if (opts?.strict ?? true) {
    invariant(
      nearestMatchRouteId() == matchRouteId,
      `useMatch("${
        matchRouteId as string
      }") is being called in a component that is meant to render the '${nearestMatchRouteId}' route. Did you mean to 'useMatch("${
        matchRouteId as string
      }", { strict: false })' or 'useRoute("${
        matchRouteId as string
      }")' instead?`,
    )
  }

  const match = useRouterState({
    select: (state) => {
      const matches = state.matches
      const match = opts?.from
        ? matches.find((d) => d.routeId === opts?.from)
        : matches.find((d) => d.id === nearestMatchId())

      invariant(
        match,
        `Could not find ${
          opts?.from
            ? `an active match from "${opts.from}"`
            : 'a nearest match!'
        }`,
      )

      return (opts?.select?.(match as any) ?? match) as TSelected
    },
  })

  return match as any
}

export function useLoader<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TLoader = RegisteredRoutesInfo['routesById'][TFrom]['__types']['loader'],
  TSelected = TLoader,
>(opts?: {
  from: TFrom
  strict?: TStrict
  select?: (search: TLoader) => TSelected
}): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) =>
      (opts?.select?.(match.loaderData as TLoader) ??
        match.loaderData) as TSelected,
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
}): TSelected {
  return useRouterState({
    select: (state: any) => {
      const params = (last(state.matches) as any)?.params
      return (opts?.select?.(params) ?? params) as TSelected
    },
  })
}

type SolidLazyComponent<T> = ReturnType<typeof lazy<(arg0: T) => JSXElement>>

export type AnchorAttributes = Omit<
  JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
  'style'
> & {
  style?: JSX.CSSProperties
}

export type SyncRouteComponent<TProps> =
  | ((props: TProps) => JSXElement)
  | SolidLazyComponent<(props: TProps) => JSXElement>

export type AsyncRouteComponent<TProps> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export type RouteErrorComponent = AsyncRouteComponent<RouteErrorComponentProps>

export type RouteErrorComponentProps = {
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

  const lazyComp = lazy(async () => {
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
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = LinkOptions<RegisteredRoutesInfo, TFrom, TTo> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?: AnchorAttributes | (() => AnchorAttributes)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?: AnchorAttributes | (() => AnchorAttributes)
  // If set to `true`, the link's underlying navigate() call will be wrapped in a `React.startTransition` call. Defaults to `true`.
  startTransition?: boolean
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
        ) => JSXElement)
      | JSXElement
  }

export type MakeLinkPropsOptions<
  TFrom extends string = '/',
  TTo extends string = '',
> = LinkPropsOptions<TFrom, TTo> & AnchorAttributes

export type MakeLinkOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = LinkPropsOptions<TFrom, TTo> &
  Omit<AnchorAttributes, 'children'> & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?: JSXElement | ((state: { isActive: boolean }) => JSXElement)
  }

export type PromptProps = {
  message: string
  condition?: boolean | any
  children?: JSXElement
}

//

export function useLinkProps<
  TFrom extends string = '/',
  TTo extends string = '',
>(options: MakeLinkPropsOptions<TFrom, TTo>): AnchorAttributes {
  const router = useRouter()

  const {
    // custom props
    type,
    children,
    target,
    activeProps = () => ({ class: 'active' }),
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
    class: aClass,
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

  const handleSolidClick = (e: Event) => {
    if (options.startTransition ?? true) {
      ;(startTransition || ((d) => d))(() => {
        handleClick(e)
      })
    }
  }

  const composeHandlers =
    (handlers: (undefined | ((e: any) => void))[]) => (e: Event) => {
      if ('persist' in e && typeof e.persist === 'function') e.persist()
      handlers.filter(Boolean).forEach((handler) => {
        if (e.defaultPrevented) return
        handler!(e)
      })
    }

  // Get the active props
  const resolvedActiveProps: AnchorAttributes = isActive
    ? functionalUpdate(activeProps as any, {}) ?? {}
    : {}

  // Get the inactive props
  const resolvedInactiveProps: AnchorAttributes = isActive
    ? {}
    : functionalUpdate(inactiveProps, {}) ?? {}

  return {
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    ...rest,
    href: disabled ? undefined : next.href,
    // @ts-ignore
    onClick: composeHandlers([onClick, handleSolidClick]),
    // @ts-ignore
    onFocus: composeHandlers([onFocus, handleFocus]),
    // @ts-ignore
    onMouseEnter: composeHandlers([onMouseEnter, handleEnter]),
    // @ts-ignore
    onMouseLeave: composeHandlers([onMouseLeave, handleLeave]),
    // @ts-ignore
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
    target,
    style: {
      ...style,
      ...resolvedActiveProps.style,
      ...resolvedInactiveProps.style,
    },
    class:
      [aClass, resolvedActiveProps.class, resolvedInactiveProps.class]
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
    props: MakeLinkOptions<TFrom, TTo> & AnchorAttributes,
  ): JSXElement
}

export const Link: LinkFn = (props: any) => {
  const linkProps = useLinkProps(props)

  return (
    <a
      {...{
        ref: props.ref as any,
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
}

export function Navigate<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
>(props: NavigateOptions<RegisteredRoutesInfo, TFrom, TTo>): null {
  const router = useRouter()

  createRenderEffect(() => {
    router.navigate(props as any)
  }, [])

  return null
}

export const matchIdsContext = createContext<string[]>(null!)
export const routerContext = createContext<RegisteredRouter>(null!)

export type RouterProps<
  TRouteConfig extends AnyRoute = AnyRoute,
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<RouterOptions<TRouteConfig, TDehydrated>, 'context'> & {
  router: Router<TRouteConfig, TRoutesInfo>
  context?: Partial<RouterOptions<TRouteConfig, TDehydrated>['context']>
}

export function useRouterState<TSelected = RegisteredRouter['state']>(opts?: {
  select: (state: RegisteredRouter['state']) => TSelected
}): TSelected {
  const router = useRouter()

  return useStore(router.__store, opts?.select)
}

export function RouterProvider<
  TRouteConfig extends AnyRoute = AnyRoute,
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(props: RouterProps<TRouteConfig, TRoutesInfo, TDehydrated>) {
  const [routerProps, rest] = splitProps(props, ['router'])

  createEffect(() => {
    routerProps.router.update(rest)
  })

  createEffect(() => {
    let unsub

    startTransition(() => {
      unsub = routerProps.router.mount()
    })

    return unsub
  })

  return (
    <Suspense fallback={null}>
      <Dynamic component={routerProps.router.options.Wrap || SafeFragment}>
        <routerContext.Provider value={props.router as any}>
          <Matches />
        </routerContext.Provider>
      </Dynamic>
    </Suspense>
  )
}

function Matches() {
  const router = useRouter()

  const matchIds = useRouterState({
    select: (state) => {
      const hasPendingComponent = state.pendingMatches.some((d) => {
        const route = router.getRoute(d.routeId as any)
        return !!route?.options.pendingComponent
      })

      if (hasPendingComponent) {
        console.log('hasPending')
        return state.pendingMatchIds
      }

      return state.matchIds
    },
  })

  const [matchesMatchIds, setMatchesMatchIds] = createStore([
    undefined!,
    ...matchIds,
  ])

  createEffect(() => {
    const ids = matchIds
    setMatchesMatchIds([undefined!, ...ids])
  })

  return (
    <matchIdsContext.Provider value={matchesMatchIds}>
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
  const value = useContext(routerContext)!
  warning(value, 'useRouter must be used inside a <Router> component!')
  return value
}

export function useMatches<T = RouteMatch[]>(opts?: {
  select?: (matches: RouteMatch[]) => T
}): T {
  const matchIds = useContext(matchIdsContext)!

  return useRouterState({
    select: (state) => {
      const matches = state.matches.slice(
        state.matches.findIndex((d) => d.id === matchIds[0]),
      )
      return (opts?.select?.(matches) ?? matches) as T
    },
  })
}

export type RouteFromIdOrRoute<T> = T extends RegisteredRoutesInfo['routeUnion']
  ? T
  : T extends keyof RegisteredRoutesInfo['routesById']
  ? RegisteredRoutesInfo['routesById'][T]
  : T extends string
  ? keyof RegisteredRoutesInfo['routesById']
  : never

export function useRouterContext<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TContext = RegisteredRoutesInfo['routesById'][TFrom]['__types']['context'],
  TSelected = TContext,
>(opts?: {
  from: TFrom
  strict?: TStrict
  select?: (search: TContext) => TSelected
}): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) =>
      (opts?.select?.(match.context as TContext) ?? match.context) as TSelected,
  })
}

export function useRouteContext<
  TFrom extends keyof RegisteredRoutesInfo['routesById'],
  TStrict extends boolean = true,
  TRouteContext = RegisteredRoutesInfo['routesById'][TFrom]['__types']['routeContext'],
  TSelected = TRouteContext,
>(opts?: {
  from: TFrom
  strict?: TStrict
  select?: (search: TRouteContext) => TSelected
}): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) =>
      (opts?.select?.(match.routeContext as TRouteContext) ??
        match.routeContext) as TSelected,
  })
}

export function useNavigate<
  TDefaultFrom extends RegisteredRoutesInfo['routePaths'] = '/',
>(defaultOpts?: { from?: TDefaultFrom }) {
  const router = useRouter()
  return function <
    TFrom extends RegisteredRoutesInfo['routePaths'] = TDefaultFrom,
    TTo extends string = '',
  >(opts?: NavigateOptions<RegisteredRoutesInfo, TFrom, TTo>) {
    return router.navigate({ ...defaultOpts, ...(opts as any) })
  }
}

export function useMatchRoute() {
  const router = useRouter()

  return function <TFrom extends string = '/', TTo extends string = ''>(
    opts: MakeUseMatchRouteOptions<TFrom, TTo>,
  ) {
    const { pending, caseSensitive, ...rest } = opts

    return router.matchRoute(rest as any, {
      pending,
      caseSensitive,
    })
  }
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
  const matchIds = useContext(matchIdsContext)!

  const [outletMatchIds, setOutletMatchIds] = createStore(matchIds.slice(1))

  createEffect(() => {
    setOutletMatchIds(matchIds.slice(1))
  })

  return (
    <Show when={outletMatchIds.length}>
      <Match matchIds={outletMatchIds} />
    </Show>
  )
}

const defaultPending = () => null

function Match(props: { matchIds: string[] }) {
  const router = useRouter()

  const routeId = () => router.getRouteMatch(props.matchIds[0])!.routeId
  const route = () => router.getRoute(routeId())

  const PendingComponent = () =>
    (route().options.pendingComponent ??
      router.options.defaultPendingComponent ??
      defaultPending) as any

  const errorComponent = () =>
    route().options.errorComponent ??
    router.options.defaultErrorComponent ??
    ErrorComponent

  return (
    <matchIdsContext.Provider value={props.matchIds}>
      <Dynamic
        component={!!errorComponent() ? CatchBoundary : SafeFragment}
        errorComponent={errorComponent()}
        onCatch={() => {
          warning(false, `Error in route match: ${props.matchIds[0]}`)
        }}
      >
        <Dynamic
          component={
            (route().options.wrapInSuspense as any) ?? !route().isRoot
              ? Suspense
              : SafeFragment
          }
          fallback={
            <Dynamic
              component={PendingComponent()}
              useLoader={route().useLoader}
              useMatch={route().useMatch}
              useContext={route().useContext}
              useRouteContext={route().useRouteContext}
              useSearch={route().useSearch}
              useParams={route().useParams}
            />
          }
        >
          <MatchInner
            matchId={props.matchIds[0]}
            PendingComponent={PendingComponent()}
          />
        </Dynamic>
      </Dynamic>
    </matchIdsContext.Provider>
  )
}

function MatchInner(props: { matchId: string; PendingComponent: any }) {
  const router = useRouter()

  const match = useRouterState({
    select: (d) => {
      const match = d.matchesById[props.matchId]
      return pick(match!, ['status', 'loadPromise', 'routeId', 'error'])
    },
  })

  const route = () => router.getRoute(match.routeId)

  const Fallback = () => {
    if (match.status === 'error') {
      throw match.error
    }

    invariant(
      false,
      'Idle routeMatch status encountered during rendering! You should never see this. File an issue!',
    )
  }

  const routeProps = () => ({
    useLoader: route().useLoader,
    useMatch: route().useMatch,
    useContext: route().useContext,
    useRouteContext: route().useRouteContext,
    useSearch: route().useSearch,
    useParams: route().useParams,
  })

  return (
    <Switch fallback={<Fallback />}>
      <SolidMatch when={match.status === 'pending'}>
        <Dynamic component={props.PendingComponent} {...routeProps()} />
      </SolidMatch>
      <SolidMatch when={match.status === 'success'}>
        <Show
          when={route().options.component ?? router.options.defaultComponent}
          fallback={<Outlet />}
        >
          <Dynamic
            component={
              (route().options.component as any) ??
              router.options.defaultComponent
            }
            {...routeProps()}
          />
        </Show>
      </SolidMatch>
    </Switch>
  )
}

const SafeFragment: ParentComponent = (props) => {
  return <>{props.children}</>
}

export function useInjectHtml() {
  const router = useRouter()

  return function (html: string | (() => Promise<string> | string)) {
    router.injectHtml(html)
  }
}

export function useDehydrate() {
  const router = useRouter()

  return function dehydrate<T>(key: any, data: T | (() => Promise<T> | T)) {
    return router.dehydrateData(key, data)
  }
}

export function useHydrate() {
  const router = useRouter()

  return function hydrate<T = unknown>(key: any) {
    return router.hydrateData(key) as T
  }
}

const CatchBoundary: ParentComponent<{
  children: any
  errorComponent: any
  onCatch: (error: any, info: any) => void
}> = (props) => {
  return (
    <ErrorBoundary
      fallback={(error, reset) => {
        return (
          <CatchBoundaryInner
            {...props}
            errorState={{ error, info: error.message }}
            reset={reset}
          />
        )
      }}
    >
      {props.children}
    </ErrorBoundary>
  )
}

function CatchBoundaryInner(props: {
  children: any
  errorComponent: any
  errorState: { error: unknown; info: any }
  reset: () => void
}) {
  return (
    <Dynamic
      component={props.errorComponent ?? ErrorComponent}
      {...props.errorState}
      reset={props.reset}
    >
      {props.children}
    </Dynamic>
  )
}

export function ErrorComponent(props: { error: unknown; reset?: () => void }) {
  const [show, setShow] = createSignal(process.env.NODE_ENV !== 'production')

  return (
    <div style={{ padding: '.5rem', 'max-width': '100%' }}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '.5rem' }}>
        <strong style={{ 'font-size': '1rem' }}>Something went wrong!</strong>
        <button
          style={{
            appearance: 'none',
            'font-size': '.6em',
            border: '1px solid currentColor',
            padding: '.1rem .2rem',
            'font-weight': 'bold',
            'border-radius': '.25rem',
          }}
          onClick={() => setShow((d) => !d)}
        >
          <Show when={show()} fallback={'Show Error'}>
            Hide Error
          </Show>
        </button>
      </div>
      <div style={{ height: '.25rem' }} />
      <Show when={show()}>
        <div>
          <pre
            style={{
              'font-size': '.7em',
              border: '1px solid red',
              'border-radius': '.25rem',
              padding: '.3rem',
              color: 'red',
              overflow: 'auto',
            }}
          >
            <Show when={props.error instanceof Error && props.error.message}>
              {(message) => <code>{message()}</code>}
            </Show>
          </pre>
          <Show when={props.reset}>
            <button onClick={props.reset}>Reset</button>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export function useBlocker(
  message: string,
  condition: boolean | any = true,
): void {
  const router = useRouter()

  createEffect(() => {
    if (!condition) return

    let unblock = router.history.block((retry, _cancel) => {
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
  return (children ?? null) as JSXElement
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
