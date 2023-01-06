import * as React from 'react'

import { useSyncExternalStore } from 'use-sync-external-store/shim'
// @ts-ignore
// import { useSyncExternalStore } from './uSES/useSyncExternalStoreShim'
import { createEffect, createRoot, untrack, unwrap } from '@solidjs/reactivity'
import { createStore } from '@solidjs/reactivity'

import {
  Route,
  RegisteredAllRouteInfo,
  RegisteredRouter,
  RouterStore,
  last,
  sharedClone,
  Action,
  warning,
  RouterOptions,
  RouteMatch,
  MatchRouteOptions,
  RouteConfig,
  AnyRouteConfig,
  AnyAllRouteInfo,
  DefaultAllRouteInfo,
  functionalUpdate,
  createRouter,
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
} from '@tanstack/router-core'

export * from '@tanstack/router-core'

export * from '@solidjs/reactivity'

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
    to,
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
    ? functionalUpdate(activeProps, {}) ?? {}
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

const EMPTY = {}

export const __useStoreValue = <TSeed, TReturn>(
  seed: () => TSeed,
  selector?: (seed: TSeed) => TReturn,
): TReturn => {
  const valueRef = React.useRef<TReturn>(EMPTY as any)

  // If there is no selector, track the seed
  // If there is a selector, do not track the seed
  const getValue = () =>
    (!selector ? seed() : selector(untrack(() => seed()))) as TReturn

  // If empty, initialize the value
  if (valueRef.current === EMPTY) {
    valueRef.current = sharedClone(undefined, getValue())
  }

  // Snapshot should just return the current cached value
  const getSnapshot = React.useCallback(() => valueRef.current, [])

  const getStore = React.useCallback((cb: () => void) => {
    // A root is necessary to track effects
    return createRoot(() => {
      createEffect(() => {
        // Read and update the value
        // getValue will handle which values are accessed and
        // thus tracked.
        // sharedClone will both recursively track the end result
        // and ensure that the previous value is structurally shared
        // into the new version.
        valueRef.current = unwrap(
          // Unwrap the value to get rid of any proxy structures
          sharedClone(valueRef.current, getValue()),
        )
        cb()
      })
    })
  }, [])

  return useSyncExternalStore(getStore, getSnapshot, getSnapshot)
}

const [store, setStore] = createStore({ foo: 'foo', bar: { baz: 'baz' } })

createRoot(() => {
  let prev: any

  createEffect(() => {
    console.log('effect')
    const next = sharedClone(prev, store)
    console.log(next)
    prev = untrack(() => next)
  })
})

setStore((s) => {
  s.foo = '1'
})

setStore((s) => {
  s.bar.baz = '2'
})

export function createReactRouter<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
  TRouterContext = unknown,
>(
  opts: RouterOptions<TRouteConfig, TRouterContext>,
): Router<TRouteConfig, TAllRouteInfo, TRouterContext> {
  const coreRouter = createRouter<TRouteConfig>({
    ...opts,
    loadComponent: async (component) => {
      if (component.preload) {
        await component.preload()
      }

      return component as any
    },
  })

  return coreRouter as any
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

  const [, , currentMatches] = __useStoreValue(
    () => router.store,
    (s) => [s.status, s.pendingMatches, s.currentMatches],
  )

  React.useEffect(router.mount, [router])

  console.log('current', currentMatches)

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
): T {
  const router = useRouter()
  return __useStoreValue(() => router.store, selector)
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
  // TSelected = TRouteMatch,
>(opts?: {
  from: TFrom
  strict?: TStrict
  // select?: (match: TRouteMatch) => TSelected
}): TStrict extends true ? TRouteMatch : TRouteMatch | undefined {
  const router = useRouter()
  const nearestMatch = useMatches()[0]!
  const match = opts?.from
    ? router.store.currentMatches.find((d) => d.routeId === opts?.from)
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

  __useStoreValue(() => match!.store)

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
  TSelected = TLoaderData,
>(opts?: {
  from: TFrom
  strict?: TStrict
  select?: (loaderData: TLoaderData) => TSelected
}): TStrict extends true ? TSelected : TSelected | undefined {
  const match = useMatch(opts) as any
  return __useStoreValue(() => match?.store.loaderData, opts?.select)
}

export function useSearch<
  TFrom extends keyof RegisteredAllRouteInfo['routeInfoById'],
  TStrict extends boolean = true,
  TSearch = RegisteredAllRouteInfo['routeInfoById'][TFrom]['fullSearchSchema'],
  TSelected = TSearch,
>(opts?: {
  from: TFrom
  strict?: TStrict
  select?: (search: TSearch) => TSelected
}): TStrict extends true ? TSelected : TSelected | undefined {
  const match = useMatch(opts)
  return __useStoreValue(() => match?.store.search, opts?.select) as any
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
  select?: (search: TDefaultSelected) => TSelected
}): TSelected {
  const router = useRouter()
  return __useStoreValue(
    () => last(router.store.currentMatches)?.params as any,
    opts?.select,
  )
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

export function useAction<
  TFrom extends keyof RegisteredAllRouteInfo['routeInfoById'] = '/',
  TFromRoute extends RegisteredAllRouteInfo['routeInfoById'][TFrom] = RegisteredAllRouteInfo['routeInfoById'][TFrom],
>(opts: {
  from: TFrom
}): Action<TFromRoute['actionPayload'], TFromRoute['actionResponse']> {
  const route = useRoute(opts.from)
  const action = route.action
  __useStoreValue(() => action)
  return action as any
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

  return React.createElement(
    typeof props.children === 'function'
      ? (props.children as any)(params)
      : props.children,
    props as any,
  )
}

export function Outlet() {
  const router = useRouter()
  const matches = useMatches().slice(1)
  const match = matches[0]

  const defaultPending = React.useCallback(() => null, [])

  __useStoreValue(() => match?.store)

  const Inner = React.useCallback((props: { match: RouteMatch }): any => {
    if (props.match.store.status === 'error') {
      throw props.match.store.error
    }

    if (props.match.store.status === 'success') {
      return React.createElement(
        (props.match.__.component as any) ??
          router.options.defaultComponent ??
          Outlet,
      )
    }

    if (props.match.store.status === 'loading') {
      throw props.match.__.loadPromise
    }

    invariant(
      false,
      'Idle routeMatch status encountered during rendering! You should never see this. File an issue!',
    )
  }, [])

  if (!match) {
    return null
  }

  const PendingComponent = (match.__.pendingComponent ??
    router.options.defaultPendingComponent ??
    defaultPending) as any

  const errorComponent =
    match.__.errorComponent ?? router.options.defaultErrorComponent

  return (
    <matchesContext.Provider value={matches}>
      <React.Suspense fallback={<PendingComponent />}>
        <CatchBoundary
          key={match.routeId}
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
    console.error(`Error in route match: ${this.props.match.matchId}`)
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

  React.useEffect(() => {
    if (activeErrorState) {
      let prevKey = router.store.currentLocation.key
      return createRoot(() =>
        createEffect(() => {
          if (router.store.currentLocation.key !== prevKey) {
            prevKey = router.store.currentLocation.key
            setActiveErrorState({} as any)
          }
        }),
      )
    }

    return
  }, [activeErrorState])

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

export function usePrompt(message: string, when: boolean | any): void {
  const router = useRouter()

  React.useEffect(() => {
    if (!when) return

    let unblock = router.history.block((transition) => {
      if (window.confirm(message)) {
        unblock()
        transition.retry()
      } else {
        router.store.currentLocation.pathname = window.location.pathname
      }
    })

    return unblock
  }, [when, message])
}

export function Prompt({ message, when, children }: PromptProps) {
  usePrompt(message, when ?? true)
  return (children ?? null) as ReactNode
}

// function circularStringify(obj: any) {
//   const seen = new Set()

//   return (
//     JSON.stringify(obj, (_, value) => {
//       if (typeof value === 'function') {
//         return undefined
//       }
//       if (typeof value === 'object' && value !== null) {
//         if (seen.has(value)) return
//         seen.add(value)
//       }
//       return value
//     }) || ''
//   )
// }
