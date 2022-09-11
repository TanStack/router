import * as React from 'react'

import { useSyncExternalStore } from 'use-sync-external-store/shim'

import {
  warning,
  Router,
  RouterOptions,
  RouteMatch,
  NavigateOptions,
  MatchLocation,
  MatchRouteOptions,
  LinkOptions,
  RouteDef,
  RoutesInfo,
  Route,
} from '@tanstack/router-core'

export * from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  interface FrameworkGenerics {
    Element: React.ReactNode
    AsyncElement: (opts: {
      params: Record<string, string>
    }) => Promise<React.ReactNode>
    SyncOrAsyncElement: React.ReactNode | FrameworkGenerics['AsyncElement']
    LinkProps: React.HTMLAttributes<unknown>
  }
}

export type PromptProps = {
  message: string
  when?: boolean | any
  children?: React.ReactNode
}

//

const matchesContext = React.createContext<RouteMatch[]>(null!)
const routerContext = React.createContext<{ router: Router<any, any> }>(null!)

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)

const useLayoutEffect = isDOM ? React.useLayoutEffect : React.useEffect

export type MatchesProviderProps = {
  value: RouteMatch[]
  children: React.ReactNode
}

export function MatchesProvider(props: MatchesProviderProps) {
  return <matchesContext.Provider {...props} />
}

export type RouterProps<TRouteDefs extends RouteDef = RouteDef> =
  RouterOptions<TRouteDefs> & {
    router: Router<TRouteDefs>
    // Children will default to `<Outlet />` if not provided
    children?: React.ReactNode
  }

// export class ReactRoute<
//   TId extends string = string,
//   TPath extends string = string,
//   TLoaderData extends LoaderData = {},
//   TAllLoaderData extends LoaderData = {},
//   TActionPayload = unknown,
//   TActionResponse = unknown,
//   TSearchZod extends SearchZod = {},
//   TSearchSchema extends AnySearchSchema = {},
//   TParams extends RouteParams = Record<ParsePathParam<TPath>, string>,
// > extends Route<
//   TId,
//   TPath,
//   TLoaderData,
//   TAllLoaderData,
//   TActionPayload,
//   TActionResponse,
//   TSearchZod,
//   TSearchSchema,
//   TParams
// > {
//   constructor(options) {
//     super()
//   }
// }

export function RouterProvider<TRouteDefs extends RouteDef = RouteDef>({
  children,
  router,
  ...rest
}: RouterProps<TRouteDefs>) {
  router.update(rest)

  useSyncExternalStore(
    (cb) => router.subscribe(() => cb()),
    () => router.state,
  )

  useLayoutEffect(() => {
    router.mount()
  }, [])

  return (
    <routerContext.Provider value={{ router }}>
      <MatchesProvider
        value={[router.rootMatch as RouteMatch, ...router.state.matches]}
      >
        {children ?? <Outlet />}
      </MatchesProvider>
    </routerContext.Provider>
  )
}

export function useRouter(): Router {
  const value = React.useContext(routerContext)
  warning(value, 'useRouter must be used inside a <Router> component!')

  useSyncExternalStore(
    (cb) => value.router.subscribe(() => cb()),
    () => value.router.state,
  )

  return value.router as Router
}

function useLatestCallback<TCallback extends (...args: any[]) => any>(
  cb: TCallback,
) {
  const cbRef = React.useRef<TCallback>(cb)
  cbRef.current = cb
  return React.useCallback(
    (...args: Parameters<TCallback>): ReturnType<TCallback> =>
      cbRef.current(...args),
    [],
  )
}

export function useMatches(): RouteMatch[] {
  return React.useContext(matchesContext)
}

export function useParentMatches(): RouteMatch[] {
  const router = useRouter()
  const match = useMatch()
  const matches = router.state.matches
  return matches.slice(0, matches.findIndex((d) => d.id === match.id) - 1)
}

export function useMatch<T>(): RouteMatch {
  return useMatches()?.[0] as RouteMatch
}

export function useLoaderData() {
  const router = useRouter()
  return router.state.loaderData
}

export function useAction<
  TPayload = unknown,
  TResponse = unknown,
  TError = unknown,
>(opts?: Pick<NavigateOptions, 'to' | 'from'>) {
  const match = useMatch()
  const router = useRouter()
  return router.getAction<TPayload, TResponse>(
    { from: match.pathname, to: '.', ...opts },
    {
      isActive: !opts?.to,
    },
  )
}

// export function Form(props: React.HTMLProps<HTMLFormElement>) {
//   const action = useAction()

//   return (
//     <form
//       {...props}

//     >
//       {props.children}
//     </form>
//   )
// }

export function useMatchRoute() {
  const router = useRouter()
  const match = useMatch()

  return useLatestCallback(
    (matchLocation: MatchLocation, opts?: MatchRouteOptions) => {
      return router.matchRoute(
        {
          ...matchLocation,
          from: match.pathname,
        },
        opts,
      )
    },
  )
}

export type MatchRouteProps = MatchLocation &
  MatchRouteOptions & {
    children: React.ReactNode | ((routeParams?: PathParams) => React.ReactNode)
  }

export function MatchRoute({
  children,
  pending,
  caseSensitive,
  ...rest
}: MatchRouteProps): JSX.Element {
  const matchRoute = useMatchRoute()
  const match = matchRoute(rest, { pending, caseSensitive })

  if (typeof children === 'function') {
    return children(match as any) as JSX.Element
  }

  return (match ? children : null) as JSX.Element
}

export function useLoadRoute() {
  const match = useMatch()
  const router = useRouter()

  return useLatestCallback(
    async (navigateOpts: NavigateOptions, loaderOpts: { maxAge: number }) =>
      router.loadRoute({ ...navigateOpts, from: match.pathname }, loaderOpts),
  )
}

export function useInvalidateRoute() {
  const match = useMatch()
  const router = useRouter()

  return useLatestCallback(async (navigateOpts: MatchLocation = { to: '.' }) =>
    router.invalidateRoute({ ...navigateOpts, from: match.pathname }),
  )
}

export function useNavigate() {
  const router = useRouter()
  const match = useMatch()

  return useLatestCallback((options: NavigateOptions) =>
    router.navigate({ ...options, from: match.pathname }),
  )
}

export function Navigate(options: NavigateOptions) {
  let navigate = useNavigate()

  useLayoutEffect(() => {
    navigate(options)
  }, [navigate])

  return null
}

export function Outlet() {
  const router = useRouter()
  const [_, ...matches] = useMatches()

  if (!matches.length) return null

  const [match] = matches

  let element = router.getOutletElement(matches) ?? <Outlet />

  const catchElement =
    match?.route.options.catchElement ?? router.defaultCatchElement

  return (
    <MatchesProvider value={matches}>
      <CatchBoundary catchElement={catchElement}>{element}</CatchBoundary>
    </MatchesProvider>
  )
}

export function useResolvePath() {
  const router = useRouter()
  const match = useMatch()
  return useLatestCallback((path: string) =>
    router.resolvePath(match.pathname, path),
  )
}

export function useSearch() {
  const router = useRouter()
  return router.location.search
}

// export type LinkProps<TRoutesInfo extends RoutesInfo = RoutesInfo> =
//   LinkOptions<TRoutesInfo> &
//     Omit<
//       React.AnchorHTMLAttributes<HTMLAnchorElement>,
//       'href' | 'children' | keyof LinkOptions<TRoutesInfo>
//     > & {
//       // A custom ref prop because of this: https://stackoverflow.com/questions/58469229/react-with-typescript-generics-while-using-react-forwardref/58473012
//       _ref?: React.Ref<HTMLAnchorElement>
//       // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
//       children?:
//         | React.ReactNode
//         | ((state: { isActive: boolean }) => React.ReactNode)
//     }

// export function Link(props: LinkProps<TRoutesInfo>) {
export function Link(props: any) {
  const linkUtils = useLink(props)

  const {
    to,
    children,
    _ref,
    disabled,
    target,
    search,
    hash,
    replace,
    getActiveProps,
    getInactiveProps,
    activeOptions,
    preload,
    preloadMaxAge,
    style,
    className,
    onClick,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
    onTouchEnd,
    ...rest
  } = props

  if (!linkUtils) {
    return (
      <a href={to as any} {...rest}>
        {typeof children === 'function'
          ? children({ isActive: false })
          : children}
      </a>
    )
  }

  const {
    next,
    activeProps,
    handleFocus,
    handleClick,
    handleEnter,
    handleLeave,
    inactiveProps,
    isActive,
  } = linkUtils

  const composeHandlers =
    (handlers: (undefined | ((e: any) => void))[]) =>
    (e: React.SyntheticEvent) => {
      e.persist()
      handlers.forEach((handler) => {
        if (handler) handler(e)
      })
    }

  return (
    <a
      {...{
        ...activeProps,
        ...inactiveProps,
        ...rest,
        ref: _ref,
        href: disabled ? undefined : next.href,
        onClick: composeHandlers([handleClick, onClick]),
        onFocus: composeHandlers([handleFocus, onFocus]),
        onMouseEnter: composeHandlers([handleEnter, onMouseEnter]),
        onMouseLeave: composeHandlers([handleLeave, onMouseLeave]),
        target,
        style: {
          ...style,
          ...activeProps.style,
          ...inactiveProps.style,
        },
        className:
          [className, activeProps.className, inactiveProps.className]
            .filter(Boolean)
            .join(' ') || undefined,
        ...(disabled
          ? {
              role: 'link',
              'aria-disabled': true,
            }
          : undefined),
        children:
          typeof children === 'function' ? children({ isActive }) : children,
      }}
    />
  )
}

export function useLink(opts: any) {
  const router = useRouter()
  const match = useMatch()
  const ref = React.useRef({}).current
  return router.buildLinkInfo({ ...opts, from: match.pathname as any, ref })
}

class CatchBoundary extends React.Component<{
  children: any
  catchElement: any
}> {
  state = {
    error: false,
  }
  componentDidCatch(error: any, info: any) {
    console.error(error)

    this.setState({
      error,
      info,
    })
  }
  reset = () => {
    this.setState({
      error: false,
      info: false,
    })
  }
  render() {
    const catchElement = this.props.catchElement ?? DefaultCatchBoundary

    if (this.state.error) {
      return typeof catchElement === 'function'
        ? catchElement(this.state)
        : catchElement
    }

    return this.props.children
  }
}

function DefaultCatchBoundary({ error }: { error: any }) {
  return (
    <div style={{ padding: '.5rem', maxWidth: '100%' }}>
      {error.message ? null : <h1>Something went wrong!</h1>}
      <small>
        <em>{error.message}</em>
      </small>
    </div>
  )
}
