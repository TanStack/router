import * as Solid from 'solid-js'
import * as SolidStore from 'solid-js/store'

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
  RouterOptions,
  RoutesInfo,
  ToOptions,
  ValidFromPath,
  warning,
} from '@tanstack/router'
import { useStore } from '@tanstack/solid-store'
import { Show } from 'solid-js'

export * from '@tanstack/router'
export { useStore }

// -------------------------- Types -------------------

export type SyncRouteComponent<TProps = {}> = (
  props: TProps,
) => Solid.JSXElement

export type RouteComponent<TProps = {}> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export function lazy(
  importer: () => Promise<{ default: SyncRouteComponent }>,
): RouteComponent {
  const lazyComp = Solid.lazy(importer)
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
  Solid.JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
  'style'
> & {
  style?: Solid.JSX.CSSProperties
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
      | Solid.JSXElement
      | ((
          params: RouteByPath<
            RegisteredRoutesInfo,
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['__types']['allParams'],
        ) => Solid.JSXElement)
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
    children?:
      | Solid.JSXElement
      | ((state: { isActive: boolean }) => Solid.JSXElement)
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
  children?: Solid.JSXElement
}

type ClickEventHandler = Solid.JSX.EventHandlerUnion<
  HTMLAnchorElement,
  MouseEvent
>
type FocusEventHandler = Solid.JSX.EventHandlerUnion<
  HTMLAnchorElement,
  FocusEvent
>
type TouchEventHandler = Solid.JSX.EventHandlerUnion<
  HTMLAnchorElement,
  TouchEvent
>

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
  constructor(opts: RouterOptions<TRouteConfig>) {
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
}): Solid.Accessor<TSelected> {
  const router = useRouterContext()
  useStore(
    router.store,
    (d) => {
      const params = last(d.currentMatches)?.params as any
      return opts?.track?.(params) ?? params
    },
    true,
  )

  const params = Solid.createMemo(
    () => last(router.state.currentMatches)?.params as any,
  )

  return params
}

type MatchesContextValue = AnyRouteMatch[]
export const matchesContext = Solid.createContext<MatchesContextValue>(null!)
export const routerContext = Solid.createContext<{ router: RegisteredRouter }>(
  null!,
)

export function useRouterContext(): RegisteredRouter {
  const value = Solid.useContext(routerContext)!
  warning(!value, 'useRouter must be used inside a <Router> component!')

  // useStore(value.router.store)

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
  const [routerProps, rest] = Solid.splitProps(props, ['router'])

  const [matches, setMatches] = SolidStore.createStore<MatchesContextValue>([
    undefined!,
  ])
  routerProps.router.update(rest)

  useStore(routerProps.router.store, (s) => {
    const matches = s.currentMatches
    setMatches(([undefined!] as MatchesContextValue).concat(matches))
  })

  // Not sure if this is how it's supposed to work but it's working. Might want to clean this up.
  Solid.createEffect(
    Solid.on(
      () => matches,
      () => routerProps.router.mount(),
    ),
  )

  return (
    <routerContext.Provider value={{ router: routerProps.router as any }}>
      <matchesContext.Provider value={matches}>
        <Outlet />
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
    <Solid.Show when={match() && matches()} keyed>
      <SubOutlet matches={matches().slice()} match={match() as any} />
    </Solid.Show>
  )
}

function Inner(props: { match: RouteMatch }) {
  const router = useRouterContext()

  return (
    <Solid.Switch
      fallback={() => {
        invariant(
          false,
          'Idle routeMatch status encountered during rendering! You should never see this. File an issue!',
        )
      }}
    >
      <Solid.Match when={props.match.state.status === 'error'}>
        {() => {
          throw props.match.state.error
        }}
      </Solid.Match>
      <Solid.Match when={props.match.state.status === 'success'}>
        <Solid.Switch fallback={Outlet}>
          <Solid.Match when={props.match.component} keyed>
            {(Component) => <Component />}
          </Solid.Match>
          <Solid.Match when={router.options.defaultComponent} keyed>
            {(DefaultComponent) => <DefaultComponent />}
          </Solid.Match>
        </Solid.Switch>
      </Solid.Match>
      <Solid.Match when={props.match.state.status === 'pending'}>
        {() => {
          throw props.match.__loadPromise
        }}
      </Solid.Match>
    </Solid.Switch>
  )
}

function SubOutlet(props: { matches: RouteMatch[]; match: RouteMatch }) {
  const router = useRouterContext()
  // Not sure what this is supposed to do, taken from react.
  useStore(props.match!.store, (state) => [state.status, state.error])

  return (
    <matchesContext.Provider value={props.matches.slice()}>
      <Show
        when={props.match.route.options.wrapInSuspense}
        fallback={<Inner match={props.match} />}
      >
        <Solid.Suspense
          fallback={() => (
            <Solid.Switch>
              <Solid.Match when={props.match.pendingComponent} keyed>
                {(PendingComponent) => <PendingComponent />}
              </Solid.Match>
              <Solid.Match when={router.options.defaultPendingComponent} keyed>
                {(DefaultPendingComponent) => <DefaultPendingComponent />}
              </Solid.Match>
            </Solid.Switch>
          )}
        >
          <Solid.ErrorBoundary
            fallback={(err) => <DefaultErrorBoundary error={err} />}
          >
            <Inner match={props.match} />
          </Solid.ErrorBoundary>
        </Solid.Suspense>
      </Show>
    </matchesContext.Provider>
  )
}

export function useMatches(): RouteMatch[] {
  return Solid.useContext(matchesContext)!
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

  const [, start] = Solid.useTransition()

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
  ): Solid.JSXElement
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

  Solid.createRenderEffect(() => {
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
  shallow?: boolean
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

  useStore(
    match()!.store as any,
    () => opts?.track?.(match as any) ?? match,
    opts?.shallow,
  )

  return match as any
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

function CatchBoundaryInner(props: {
  children: any
  errorComponent: any
  errorState: { error: unknown; info: any }
  reset: () => void
}) {
  const [activeErrorState, setActiveErrorState] = Solid.createSignal(
    props.errorState,
  )
  let previousRef: string | undefined

  const router = useRouterContext()
  const errorComponent = props.errorComponent ?? DefaultErrorBoundary

  Solid.createEffect(() => {
    if (activeErrorState()) {
      if (router.state.currentLocation.key !== previousRef) {
        setActiveErrorState({} as any)
      }
    }

    previousRef = router.state.currentLocation.key
  })

  Solid.createEffect(() => {
    if (props.errorState.error) {
      setActiveErrorState(props.errorState)
    }
    // props.reset()
  })

  return (
    <Solid.Show
      when={props.errorState.error && activeErrorState().error}
      fallback={props.children}
    >
      {errorComponent}
    </Solid.Show>
  )
}

export function DefaultErrorBoundary({ error }: { error: any }) {
  return (
    <div style={{ padding: '.5rem', 'max-width': '100%' }}>
      <strong style={{ 'font-size': '1.2rem' }}>Something went wrong!</strong>
      <div style={{ height: '.5rem' }} />
      <div>
        <pre>
          {error.message ? (
            <code
              style={{
                'font-size': '.7em',
                border: '1px solid red',
                'border-radius': '.25rem',
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
