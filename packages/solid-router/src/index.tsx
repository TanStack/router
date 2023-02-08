import {
  AnyRootRoute,
  AnyRouteMatch,
  AnyRoutesInfo,
  DefaultRoutesInfo,
  functionalUpdate,
  invariant,
  last,
  LinkOptions,
  MatchRouteOptions,
  NavigateOptions,
  NoInfer,
  RegisteredRouter,
  RegisteredRoutesInfo,
  ResolveRelativePath,
  RootRoute,
  RouteByPath,
  RouteMatch,
  Router,
  RouterConstructorOptions,
  RouterOptions,
  RouterStore,
  RoutesInfo,
  ToOptions,
  ValidFromPath,
  warning,
} from '@tanstack/router'
import { useStore } from '@tanstack/solid-store'
import {
  createContext,
  createEffect,
  createRenderEffect,
  createSignal,
  ErrorBoundary,
  JSX,
  JSXElement,
  lazy as solidLazy,
  Match,
  on,
  onMount,
  Show,
  splitProps,
  Suspense,
  Switch,
  useContext,
  useTransition,
} from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic, untrack } from 'solid-js/web'

export * from '@tanstack/router'
export { useStore }

// -------------------------- Types -------------------

export type SyncRouteComponent<TProps = {}> = (props: TProps) => JSXElement

export type RouteComponent<TProps = {}> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export function lazy(
  importer: () => Promise<{ default: SyncRouteComponent }>,
): RouteComponent {
  const lazyComp = solidLazy(importer)
  let preloaded: Promise<SyncRouteComponent>

  const finalComp = lazyComp as unknown as RouteComponent

  finalComp.preload = async () => {
    if (!preloaded) {
      await importer()
    }
  }

  return finalComp
}

// !Todo need to remove bound events being supported
export type AnchorAttributes = Omit<
  JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
  'style'
> & {
  style?: JSX.CSSProperties
}

export type LinkPropsOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = LinkOptions<RegisteredRoutesInfo, TFrom, TTo> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?: AnchorAttributes | (() => AnchorAttributes)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?: AnchorAttributes | (() => AnchorAttributes)
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
      | JSXElement
      | ((
          params: RouteByPath<
            RegisteredRoutesInfo,
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['__types']['allParams'],
        ) => JSXElement)
  }

export type MakeLinkPropsOptions<
  TFrom extends ValidFromPath<RegisteredRoutesInfo> = '/',
  TTo extends string = '',
> = LinkPropsOptions<TFrom, TTo> & AnchorAttributes

export type MakeLinkOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = LinkPropsOptions<TFrom, TTo> &
  AnchorAttributes &
  Omit<AnchorAttributes, 'children'> & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?: JSXElement | ((state: { isActive: boolean }) => JSXElement)
  }

declare module '@tanstack/router' {
  interface FrameworkGenerics {
    Component: RouteComponent
    ErrorComponent: RouteComponent<{
      error: Error
      info: { componentStack: string }
    }>
  }

  interface FrameworkRouteOptions {
    wrapInSuspense?: boolean
  }
}

export type PromptProps = {
  message: string
  when?: boolean | any
  children?: JSXElement
}

type ClickEventHandler = JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent>
type FocusEventHandler = JSX.EventHandlerUnion<HTMLAnchorElement, FocusEvent>
type TouchEventHandler = JSX.EventHandlerUnion<HTMLAnchorElement, TouchEvent>

type HandlerEvent =
  | ClickEventHandler
  | FocusEventHandler
  | TouchEventHandler
  | undefined

// copied from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/2bd0b3271c992ed9c22055f7151216f64afd7a3b/types/react/index.d.ts#L909-L935
interface SyntheticEvent<T = Element> {
  bubbles: boolean
  /**
   * A reference to the element on which the event listener is registered.
   */
  currentTarget: EventTarget & T
  cancelable: boolean
  defaultPrevented: boolean
  eventPhase: number
  isTrusted: boolean
  nativeEvent: Event
  preventDefault(): void
  isDefaultPrevented(): boolean
  stopPropagation(): void
  isPropagationStopped(): boolean
  persist(): void
  // If you thought this should be `EventTarget & T`, see https://github.com/DefinitelyTyped/DefinitelyTyped/pull/12239
  /**
   * A reference to the element from which the event was originally dispatched.
   * This might be a child element to the element on which the event listener is registered.
   *
   * @see currentTarget
   */
  target: EventTarget
  timeStamp: number
  type: string
}

export class SolidRouter<
  TRouteConfig extends AnyRootRoute = RootRoute,
  TRoutesInfo extends AnyRoutesInfo = RoutesInfo<TRouteConfig>,
> extends Router<TRouteConfig, TRoutesInfo> {
  constructor(opts: RouterConstructorOptions<TRouteConfig>) {
    super({
      ...opts,
      loadComponent: async (component) => {
        if (component.preload) {
          await component.preload()
        }

        return component
      },
    })
  }
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

  return useStore(router.__store, (d) => {
    const params = last(d.currentMatches)?.params as any
    return opts?.track?.(params) ?? params
  })
}

type MatchesContextValue = AnyRouteMatch[]
export const matchesContext = createContext<MatchesContextValue>(null!)
export const routerContext = createContext<{ router: RegisteredRouter }>(null!)

export function useRouterContext(): RegisteredRouter {
  const value = useContext(routerContext)!
  warning(value, 'useRouter must be used inside a <Router> component!')
  // useStore(value.router.__store)

  return value.router
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
>(props: RouterProps<TRouteConfig, TRoutesInfo>) {
  const [routerProps, rest] = splitProps(props, ['router'])

  const [matches, setMatches] = createStore<MatchesContextValue>([undefined!])
  routerProps.router.update(rest)

  const store = useStore(routerProps.router.__store, (s) => s)

  onMount(routerProps.router.mount)

  createEffect(
    on(
      () => [store.currentMatches, store.status] as const,
      ([matches]) => {
        setMatches(([undefined!] as MatchesContextValue).concat(matches))
      },
    ),
  )

  return (
    <routerContext.Provider value={{ router: routerProps.router as any }}>
      <matchesContext.Provider value={matches}>
        <CatchBoundary
          errorComponent={ErrorComponent}
          onCatch={() => {
            warning(
              false,
              `Error in router! Consider setting an 'errorComponent' in your RootRoute! 👍`,
            )
          }}
        >
          {() => <Outlet />}
        </CatchBoundary>
      </matchesContext.Provider>
    </routerContext.Provider>
  )
}

export function Outlet() {
  const matchesContext = useMatches()

  const matches = () => matchesContext.slice(1)
  const match = () => matches()[0]

  // I made this keyed and watching both of match and matches so it does a deep inspection and will rerender on the changes correctly
  return (
    <Show when={match() && matches()} keyed>
      <SubOutlet matches={matches().slice()} match={match() as any} />
    </Show>
  )
}

function SubOutlet(props: { matches: RouteMatch[]; match: RouteMatch }) {
  const router = useRouterContext()

  const PendingComponent = () =>
    props.match.pendingComponent ??
    router.options.defaultPendingComponent ??
    SafeFragment

  const OutletErrorComponent = () =>
    props.match.errorComponent ?? router.options.defaultErrorComponent

  const ResolvedCatchBoundary = () =>
    OutletErrorComponent() ? CatchBoundary : SafeFragment

  return (
    <matchesContext.Provider value={props.matches.slice()}>
      <SuspenseWrapper
        wrapInSuspense={props.match.route.options.wrapInSuspense ?? true}
        pendingComponent={PendingComponent() as any}
      >
        <Dynamic
          component={ResolvedCatchBoundary()}
          errorComponent={OutletErrorComponent()}
          onCatch={() => {
            warning(false, `Error in route match: ${props.match.id}`)
          }}
        >
          {() => <Inner match={props.match} />}
        </Dynamic>
      </SuspenseWrapper>
    </matchesContext.Provider>
  )
}

function Inner(props: { match: RouteMatch }) {
  const router = useRouterContext()

  return (
    <Switch
      fallback={() => {
        invariant(
          false,
          'Idle routeMatch status encountered during rendering! You should never see this. File an issue!',
        )
      }}
    >
      <Match when={props.match.state.status === 'error'}>
        {() => {
          throw props.match.state.error
        }}
      </Match>
      <Match when={props.match.state.status === 'success'}>
        <Switch fallback={Outlet}>
          <Match when={props.match.component} keyed>
            {(Component) => <Component />}
          </Match>
          <Match when={router.options.defaultComponent} keyed>
            {(DefaultComponent) => <DefaultComponent />}
          </Match>
        </Switch>
      </Match>
      <Match when={props.match.state.status === 'pending'}>
        {() => {
          throw props.match.__loadPromise
        }}
      </Match>
    </Switch>
  )
}

function SafeFragment(props: any) {
  return <>{props?.children}</>
}

function SuspenseWrapper(props: {
  wrapInSuspense: boolean
  children: JSXElement
  pendingComponent: JSXElement
}) {
  return (
    <Show when={props.wrapInSuspense} fallback={props.children}>
      <Suspense fallback={props.pendingComponent}>
        {/* Suspense is never resolving if there isn't a wrapping html element around it*/}
        <div id="suspense">{props.children}</div>
      </Suspense>
    </Show>
  )
}

export function useMatches(): RouteMatch[] {
  return useContext(matchesContext)!
}

// -------------------------- Utils -------------------
export function useLinkProps<
  TFrom extends ValidFromPath<RegisteredRoutesInfo> = '/',
  TTo extends string = '',
>(options: MakeLinkPropsOptions<TFrom, TTo>): AnchorAttributes {
  const router = useRouterContext()

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
    class: klass,
    // element props
    style,
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

  const [, start] = useTransition()

  const internalHandleClick = (e: Event) => {
    start(() => handleClick(e))
  }

  const composeHandlers =
    (handlers: (undefined | ((e: any) => void) | HandlerEvent)[]) =>
    (e: SyntheticEvent) => {
      if (!e) return
      if (e.persist) e.persist()
      handlers.filter(Boolean).forEach((handler) => {
        if (e.defaultPrevented) return
        if (typeof handler === 'function') handler(e)
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
    onClick: composeHandlers([onClick, internalHandleClick]),
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
    class:
      [klass, resolvedActiveProps.class, resolvedInactiveProps.class]
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

// -------------------------- Components -------------------

export interface LinkFn<
  TDefaultFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TDefaultTo extends string = '',
> {
  <
    TFrom extends RegisteredRoutesInfo['routePaths'] = TDefaultFrom,
    TTo extends string = TDefaultTo,
  >(
    props: MakeLinkOptions<TFrom, TTo>,
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
  const router = useRouterContext()

  createRenderEffect(() => {
    router.navigate(props as any)
  }, [])

  return null
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
}): TStrict extends true ? TRouteMatch : TRouteMatch | undefined {
  const router = useRouterContext()
  const nearestMatch = () => useMatches()[0]!
  const match = () =>
    opts?.from
      ? router.state.currentMatches.find((d) => d.route.id === opts?.from)
      : nearestMatch()

  invariant(
    match(),
    `Could not find ${
      opts?.from ? `an active match from "${opts.from}"` : 'a nearest match!'
    }`,
  )

  if (opts?.strict ?? true) {
    invariant(
      nearestMatch().route.id == match()?.route.id,
      `useMatch("${
        match()?.route.id as string
      }") is being called in a component that is meant to render the '${
        nearestMatch().route.id
      }' route. Did you mean to 'useMatch("${
        match()?.route.id as string
      }", { strict: false })' or 'useRoute("${
        match()?.route.id as string
      }")' instead?`,
    )
  }

  return useStore(
    match()!.__store as any,
    (d) => opts?.track?.(match() as any) ?? match(),
  )
}

export function useRoute<
  TId extends keyof RegisteredRoutesInfo['routesById'] = '/',
>(routeId: TId): RegisteredRoutesInfo['routesById'][TId] {
  const router = useRouterContext()
  const resolvedRoute = () => router.getRoute(routeId as any)

  invariant(
    resolvedRoute(),
    `Could not find a route for route "${
      routeId as string
    }"! Did you forget to add it to your route?`,
  )

  return resolvedRoute as any
}

// Return a wrapped memo around for reactivity. Might want to change this so it's simular to the other APIs.
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

  return useStore(
    (match as any).__store,
    (s: any) => opts?.track?.(s?.search) ?? s?.search,
  )
}

export function useRouter<T = RouterStore>(
  track?: (state: Router['state']) => T,
): RouterStore {
  const router = useRouterContext()

  return useStore(router.__store, (d) => track?.(d as any) ?? d) as any
}

export function useNavigate<
  TDefaultFrom extends keyof RegisteredRoutesInfo['routesById'] = '/',
>(defaultOpts?: { from?: TDefaultFrom }) {
  const router = useRouterContext()
  return function <
    TFrom extends keyof RegisteredRoutesInfo['routesById'] = TDefaultFrom,
    TTo extends string = '',
  >(opts?: MakeLinkOptions<TFrom, TTo>) {
    return router.navigate({ ...defaultOpts, ...(opts as any) })
  }
}

export function useMatchRoute() {
  const router = useRouterContext()

  return function <
    TFrom extends ValidFromPath<RegisteredRoutesInfo> = '/',
    TTo extends string = '',
  >(opts: MakeUseMatchRouteOptions<TFrom, TTo>) {
    const { pending, caseSensitive, ...rest } = opts

    return router.matchRoute(rest as any, {
      pending,
      caseSensitive,
    })
  }
}

export function MatchRoute<
  TFrom extends ValidFromPath<RegisteredRoutesInfo> = '/',
  TTo extends string = '',
>(props: MakeMatchRouteOptions<TFrom, TTo>): any {
  const matchRoute = useMatchRoute()
  const params = matchRoute(props)

  return (
    <Show when={params}>
      <Show
        when={typeof props.children === 'function'}
        fallback={props.children as JSXElement}
      >
        {(props.children as any)(params)}
      </Show>
    </Show>
  )
}

function CatchBoundary(props: {
  children: (props: { error?: string }) => JSXElement
  errorComponent: any
  onCatch: (error: any) => void
}) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => {
        console.error(error)
        props.onCatch(error)
        return (
          <CatchBoundaryInner
            reset={reset}
            errorState={{ error }}
            errorComponent={props.errorComponent}
          >
            {(err: any) => props.children(err)}
          </CatchBoundaryInner>
        )
      }}
    >
      {props.children({})}
    </ErrorBoundary>
  )
}

function CatchBoundaryInner(props: {
  children: any
  errorComponent: any
  errorState: { error: any }
  reset: () => void
}) {
  const [activeErrorState, setActiveErrorState] = createSignal(props.errorState)
  let previousRef: string | undefined

  const router = useRouterContext()
  const errorComponent = props.errorComponent ?? ErrorComponent

  createEffect(() => {
    if (activeErrorState()) {
      if (router.state.currentLocation.key !== previousRef) {
        setActiveErrorState({} as any)
      }
    }

    previousRef = router.state.currentLocation.key
  })

  createEffect(() => {
    if (props.errorState.error) {
      setActiveErrorState(props.errorState)
    }
    // props.reset()
  })

  return (
    <Show
      when={props.errorState.error && activeErrorState().error}
      fallback={props.children}
    >
      <div class="flex flex-col gap-2">
        {typeof errorComponent === 'function' && errorComponent.length
          ? untrack(() => errorComponent(props.errorState))
          : errorComponent}
        <button
          class="border border-red-500 w-16 text-red-500"
          onClick={props.reset}
        >
          Reset
        </button>
      </div>
    </Show>
  )
}

export function ErrorComponent(props: { error: any }) {
  return (
    // @ts-ignore
    <div style={{ padding: '.5rem', 'max-width': '100%' }}>
      {/* @ts-ignore */}
      <strong style={{ 'font-size': '1.2rem' }}>Something went wrong!</strong>
      {/* @ts-ignore */}
      <div style={{ height: '.5rem' }} />
      <div>
        <pre
          // @ts-ignore
          style={{
            // @ts-ignore
            'font-size': '.7em',
            // @ts-ignore
            border: '1px solid red',
            // @ts-ignore
            'border-radius': '.25rem',
            // @ts-ignore
            padding: '.5rem',
            // @ts-ignore
            color: 'red',
            // @ts-ignore
            overflow: 'auto',
          }}
        >
          <Show when={props?.error?.message}>
            <code>{props.error.message}</code>
          </Show>
        </pre>
      </div>
    </div>
  )
}
