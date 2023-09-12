// -------------------------- Core Imports -------------------
import {
  AllParams,
  AnyContext,
  AnyPathParams,
  AnyRoute,
  AnyRouteProps,
  AnySearchSchema,
  Expand,
  LinkOptions,
  MatchRouteOptions,
  MergeFromFromParent,
  NavigateOptions,
  NoInfer,
  ParsePathParams,
  ParseRoute,
  RegisteredRouter,
  ResolveAllParams,
  ResolveFullPath,
  ResolveFullSearchSchema,
  ResolveId,
  ResolveRelativePath,
  Route,
  RouteById,
  RouteByPath,
  RouteConstraints,
  RouteContext,
  RouteIds,
  RouteMatch,
  RoutePaths,
  Router,
  RouterOptions,
  RoutesById,
  ToOptions,
  UseLoaderResult,
  functionalUpdate,
  last,
  pick,
  rootRouteId,
} from '@tanstack/router-core'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'

// -------------------------- Store -------------------
import { useStore } from './store'

// -------------------------- Solid Imports -------------------
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'

import {
  ComponentProps,
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
  mergeProps,
  onCleanup,
  splitProps,
  startTransition,
  untrack,
  useContext,
} from 'solid-js'

// -------------------------- Core Exports -------------------
export * from '@tanstack/router-core'
export { useStore }

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
    TParams extends RouteConstraints['TParams'] = Expand<
      Record<ParsePathParams<TPath>, string>
    >,
    TAllParams extends RouteConstraints['TAllParams'] = ResolveAllParams<
      TParentRoute,
      TParams
    >,
    TParentContext extends RouteConstraints['TParentContext'] = TParentRoute['types']['routeContext'],
    TAllParentContext extends RouteConstraints['TAllParentContext'] = TParentRoute['types']['context'],
    TRouteContext extends RouteConstraints['TRouteContext'] = RouteContext,
    TAllContext extends RouteConstraints['TAllContext'] = MergeFromFromParent<
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

type StrictOrFrom<TFrom> =
  | {
      from: TFrom
      strict?: true
    }
  | {
      from?: never
      strict: false
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
  TFrom extends RouteIds<RegisteredRouter['routeTree']>,
  TStrict extends boolean = true,
  TRouteMatchState = RouteMatch<
    RegisteredRouter['routeTree'],
    // !TODO FIX Type
    RouteById<any, TFrom>
  >,
  TSelected = TRouteMatchState,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (match: TRouteMatchState) => TSelected
  },
): TStrict extends true ? TRouteMatchState : TRouteMatchState | undefined {
  const router = useRouter()
  const matchIds = useContext(matchIdsContext)!

  const nearestMatchId = () => matchIds[0]!
  const nearestMatchRouteId = () =>
    router.getRouteMatch(nearestMatchId())?.routeId

  const matchInfo = useRouterState({
    select: (state) => {
      const match = opts?.from
        ? state.renderedMatches.find((d) => d.routeId === opts?.from)
        : state.renderedMatches.find((d) => d.id === nearestMatchId())

      return match!
    },
  })

  if (opts?.strict ?? true) {
    invariant(
      nearestMatchRouteId() == matchInfo.routeId,
      `useMatch("${
        matchInfo.routeId
      }") is being called in a component that is meant to render the '${nearestMatchRouteId()}' route. DrouteId you mean to 'useMatch("${
        matchInfo.routeId
      }", { strict: false })' or 'useRoute("${matchInfo.routeId}")' instead?`,
    )
  }

  const matchSelection = useRouterState({
    select: (state) => {
      const match = opts?.from
        ? state.renderedMatches.find((d) => d.routeId === opts?.from)
        : state.renderedMatches.find((d) => d.id === nearestMatchId())

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
      return opts?.select
        ? opts.select(match.search as TSearch)
        : (match.search as TSelected)
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
      const params = (last(state.matches) as any)?.params
      return opts?.select ? opts.select(params) : params
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
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = LinkOptions<
  RegisteredRouter['routeTree'],
  TFrom,
  TTo,
  TMaskFrom,
  TMaskTo
> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?: AnchorAttributes | (() => AnchorAttributes)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?: AnchorAttributes | (() => AnchorAttributes)
  // If set to `true`, the link's underlying navigate() call will be wrapped in a `Solid.startTransition` call. Defaults to `true`.
  startTransition?: boolean
}

export type MakeMatchRouteOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = ToOptions<RegisteredRouter['routeTree'], TFrom, TTo, TMaskFrom, TMaskTo> &
  MatchRouteOptions & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | ((
          params?: RouteByPath<
            RegisteredRouter['routeTree'],
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['types']['allParams'],
        ) => JSXElement)
      | JSXElement
  }

export type MakeUseMatchRouteOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = ToOptions<RegisteredRouter['routeTree'], TFrom, TTo, TMaskFrom, TMaskTo> &
  MatchRouteOptions

export type MakeLinkPropsOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = LinkPropsOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
  AnchorAttributes

export type MakeLinkOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = LinkPropsOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
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

export function createLinkProps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
>(
  options: MakeLinkPropsOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
): AnchorAttributes {
  const router = useRouter()

  const props = mergeProps(
    {
      activeProps: () => ({ class: 'active' }),
      inactiveProps: () => ({}),
      to: 'a',
    },
    options,
  )

  const [, rest] = splitProps(props, [
    // custom props
    'type',
    'children',
    'target',
    'activeProps',
    'inactiveProps',
    'activeOptions',
    'disabled',
    // fromCurrent,
    'hash',
    'search',
    'params',
    'to',
    'preload',
    'preloadDelay',
    'replace',
    // element props
    'style',
    'class',
    'onClick',
    'onFocus',
    'onMouseEnter',
    'onMouseLeave',
    'onTouchStart',
  ])

  const linkInfo = useRouterState({
    select() {
      return router.buildLink(options as any)
    },
  })

  if (linkInfo.type === 'external') {
    const { href } = linkInfo
    return { href }
  }

  const handleSolidClick = (e: Event) => {
    if (options.startTransition ?? true) {
      ;(startTransition || ((d) => d))(() => {
        linkInfo.handleClick(e)
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
  const resolvedActiveProps = (): AnchorAttributes =>
    linkInfo.isActive
      ? functionalUpdate(props.activeProps as any, {}) ?? {}
      : {}

  // Get the inactive props
  const resolvedInactiveProps = (): AnchorAttributes =>
    linkInfo.isActive ? {} : functionalUpdate(props.inactiveProps, {}) ?? {}

  return {
    ...resolvedActiveProps(),
    ...resolvedInactiveProps(),
    ...rest,
    href: props.disabled ? undefined : linkInfo.next.href,
    // @ts-ignore
    onClick: composeHandlers([props.onClick, handleSolidClick]),
    // @ts-ignore
    onFocus: composeHandlers([props.onFocus, linkInfo.handleFocus]),
    // @ts-ignore
    onMouseEnter: composeHandlers([props.onMouseEnter, linkInfo.handleEnter]),
    // @ts-ignore
    onMouseLeave: composeHandlers([props.onMouseLeave, linkInfo.handleLeave]),
    onTouchStart: composeHandlers([
      // @ts-ignore
      props.onTouchStart,
      linkInfo.handleTouchStart,
    ]),
    target: props.target,
    style: {
      ...props.style,
      ...resolvedActiveProps().style,
      ...resolvedInactiveProps().style,
    },
    class:
      [props.class, resolvedActiveProps().class, resolvedInactiveProps().class]
        .filter(Boolean)
        .join(' ') || undefined,
    ...(props.disabled
      ? {
          role: 'link',
          'aria-disabled': true,
        }
      : undefined),
    // @ts-ignore
    ['data-status']: linkInfo.isActive ? 'active' : undefined,
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
      AnchorAttributes,
  ): JSXElement
}

export const Link: LinkComponent = (props: any) => {
  const linkProps = createLinkProps(props)

  return (
    <a ref={props.ref} {...linkProps}>
      <Show
        when={typeof props.children === 'function'}
        fallback={props.children}
      >
        {props.children({
          isActive: (linkProps as any)['data-status'] === 'active',
        })}
      </Show>
    </a>
  )
}

export function Navigate<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
>(
  props: NavigateOptions<
    RegisteredRouter['routeTree'],
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  >,
): null {
  const router = useRouter()

  createRenderEffect(() => {
    router.navigate(props as any)
  }, [])

  return null
}

export const matchIdsContext = createContext<string[]>(null!)
export const routerContext = createContext<RegisteredRouter>(null!)

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

  return useStore(router.__store, opts?.select)
}

export function RouterProvider<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDehydrated extends Record<string, any> = Record<string, any>,
>(props: RouterProps<TRouteTree, TDehydrated>) {
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
      {/*
        Internally this is set to a react component.
      @ts-ignore */}
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
      return state.renderedMatchIds
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

  const locationKey = useRouterState({
    select: (d) => d.resolvedLocation.state?.key,
  })

  const route = () => router.getRoute(rootRouteId)

  return (
    <matchIdsContext.Provider value={matchesMatchIds}>
      <CatchBoundary
        errorComponent={(props: ComponentProps<typeof ErrorComponent>) => (
          <ErrorComponent
            {...props}
            useMatch={route().useMatch}
            useContext={route().useContext}
            useRouteContext={route().useRouteContext}
            useSearch={route().useSearch}
            useParams={route().useParams}
          />
        )}
        resetKey={locationKey}
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

export type RouteFromIdOrRoute<T> = T extends ParseRoute<
  RegisteredRouter['routeTree']
>
  ? T
  : T extends RouteIds<RegisteredRouter['routeTree']>
  ? RoutesById<RegisteredRouter['routeTree']>[T]
  : T extends string
  ? RouteIds<RegisteredRouter['routeTree']>
  : never

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

export function useNavigate<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDefaultFrom extends RoutePaths<TRouteTree> = '/',
>(defaultOpts?: { from?: TDefaultFrom }) {
  const router = useRouter()
  return function <
    TFrom extends RoutePaths<TRouteTree> = TDefaultFrom,
    TTo extends string = '',
    TMaskFrom extends RoutePaths<TRouteTree> = '/',
    TMaskTo extends string = '',
  >(opts?: NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>) {
    return router.navigate({ ...defaultOpts, ...(opts as any) })
  }
}

export function useMatchRoute<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
>() {
  const router = useRouter()

  return function <
    TFrom extends RoutePaths<TRouteTree> = '/',
    TTo extends string = '',
    TMaskFrom extends RoutePaths<TRouteTree> = '/',
    TMaskTo extends string = '',
    TResolved extends string = ResolveRelativePath<TFrom, NoInfer<TTo>>,
  >(
    opts: MakeUseMatchRouteOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
  ): false | RouteById<TRouteTree, TResolved>['types']['allParams'] {
    const { pending, caseSensitive, ...rest } = opts

    return router.matchRoute(rest as any, {
      pending,
      caseSensitive,
    })
  }
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
  const params = matchRoute(props as any) as any

  return (
    <Show
      when={typeof props.children === 'function' && props.children}
      fallback={<Show when={!!params}>{props.children as JSXElement}</Show>}
    >
      {(children) => untrack(children)(params)}
    </Show>
  )
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

  const locationKey = useRouterState({
    select: (s) => s.resolvedLocation.state?.key,
  })

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
        resetKey={locationKey}
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
  resetKey: string
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
  resetKey: string
}) {
  const [activeError, setActiveError] = createSignal(props.errorState)

  let prevResetKey = props.resetKey

  createEffect(() => {
    if (activeError().error && prevResetKey !== props.resetKey) {
      setActiveError({} as any)
    }

    prevResetKey = props.resetKey
  })

  createEffect(() => {
    if (props.errorState) {
      setActiveError(props.errorState)
    }
  })

  return (
    <Show
      when={props.errorState.error && activeError().error}
      fallback={props.children}
    >
      <Dynamic
        component={props.errorComponent ?? ErrorComponent}
        {...activeError()}
        reset={props.reset}
      >
        {props.children}
      </Dynamic>
    </Show>
  )
}

export function ErrorComponent(props: {
  error: unknown
  reset?: () => void
  // !TODO Remove This
  [key: string]: any
}) {
  const [show, setShow] = createSignal(process.env.NODE_ENV !== 'production')

  console.error(props.error)
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

    onCleanup(unblock)
  })
}

export function Block({ message, condition, children }: PromptProps) {
  useBlocker(message, condition)
  return <Show when={children}>{children}</Show>
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
