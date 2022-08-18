import {
  createHashHistory,
  createBrowserHistory,
  createMemoryHistory,
  BrowserHistory,
  MemoryHistory,
  History,
  HashHistory,
} from 'history'
import React from 'react'
import { F } from 'ts-toolbelt'

export { createHashHistory, createBrowserHistory, createMemoryHistory }

import { decode, encode } from './qss'

// Types

export type IsAny<T, Y, N> = 1 extends 0 & T ? Y : N
export type IsKnown<T, Y, N> = unknown extends T ? N : Y
export type PickRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>

export interface FrameworkGenerics<TData = unknown> {
  // The following properties are used internally
  // and are extended by framework adapters, but cannot be
  // pre-defined as constraints:
  //
  // Element: any
  // AsyncElement: any
  // SyncOrAsyncElement?: any
  // LinkProps: any
}

export interface RouteMeta {}
export interface SearchSchema {}
export interface LocationState {}
export interface RouteParams {}
export interface LoaderData {}

type Timeout = ReturnType<typeof setTimeout>

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>

export type Updater<TResult> = TResult | ((prev?: TResult) => TResult)

export type Location = {
  href: string
  pathname: string
  search: SearchSchema
  searchStr: string
  state: LocationState
  hash: string
  key?: string
}

export type FromLocation = {
  pathname: string
  search?: SearchSchema
  key?: string
  hash?: string
}

export type Route<
  TData = unknown,
  TActionPayload = unknown,
  TActionResponse = unknown,
  TFullPath = string,
> = {
  // The path to match (relative to the nearest parent `Route` component or root basepath)
  path?: string
  // An ID to uniquely identify this route within its siblings. This is only required for routes that *only match on search* or if you have multiple routes with the same path
  id?: string
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  // Either (1) an object that will be used to shallowly match the current location's search or (2) A function that receives the current search params and can return truthy if they are matched.
  search?: SearchPredicate
  // Filter functions that can manipulate search params *before* they are passed to links and navigate
  // calls that match this route.
  preSearchFilters?: SearchFilter[]
  // Filter functions that can manipulate search params *after* they are passed to links and navigate
  // calls that match this route.
  postSearchFilters?: SearchFilter[]
  // The duration to wait during `loader` execution before showing the `pendingElement`
  pendingMs?: number
  // _If the `pendingElement` is shown_, the minimum duration for which it will be visible.
  pendingMinMs?: number
  // An array of child routes
  children?: Route<any, any, any, any>[]
  // Full path. This is used internally for TypeScript type inference and should not be set manually.
  fullPath?: TFullPath
  // Route Loaders (see below) can be inline on the route, or resolved async
} & RouteLoaders<TData, TActionPayload, TActionResponse> & {
    // If `import` is defined, this route can resolve its elements and loaders in a single asynchronous call
    // This is particularly useful for code-splitting or module federation
    import?: (opts: {
      params: RouteParams
      search: SearchSchema
    }) => Promise<RouteLoaders<TData, TActionPayload, TActionResponse>>
  }

export type ResolvedRoute<TData, TActionPayload, TActionResponse> = Omit<
  PickRequired<Route<TData, TActionPayload, TActionResponse, any>, 'id'>,
  'children'
> & {
  children?: ResolvedRoute<any, any, any>[]
}

export interface RouteLoaders<
  TData = unknown,
  TActionPayload = any,
  TActionData = unknown,
> {
  // The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`
  element?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // The content to be rendered when `loader` encounters an error
  errorElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // The content to be rendered when rendering encounters an error
  catchElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration
  pendingElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
  loader?: LoaderFn<TData>
  // An asynchronous function made available to the route for performing asynchronous or mutative actions that
  // might invalidate the route's data.
  action?: ActionFn<TActionPayload, TActionData>
  // This function is called
  // when moving from an inactive state to an active one. Likewise, when moving from
  // an active to an inactive state, the return function (if provided) is called.
  onMatch?: (
    match: RouteMatch<TData>,
  ) => void | undefined | ((match: RouteMatch<TData>) => void)
  // This function is called when the route remains active from one transition to the next.
  onTransition?: (match: RouteMatch<TData>) => void
  // An object of whatever you want! This object is accessible anywhere matches are.
  meta?: RouteMeta
}

export type SearchFilter = (prev: SearchSchema) => SearchSchema

export type MatchLocation = {
  to?: string | number | null
  search?: SearchPredicate
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
  fromCurrent?: boolean
}

export type SearchPredicate = (search: SearchSchema) => any

export type UnloadedMatch<TData, TActionPayload, TActionResponse> = {
  id: string
  route: ResolvedRoute<TData, TActionPayload, TActionResponse>
  pathname: string
  params: Record<string, string>
  search: SearchSchema
}

export type LoaderFn<TData> = (
  match: RouteMatch<TData>,
  ctx: RouteMatchContext<TData, any, any>,
) => PromiseLike<TData>

export type ActionFn<TActionPayload = unknown, TActionResponse = unknown> = (
  submission: undefined | TActionPayload,
  ctx: RouteActionContext,
) => PromiseLike<TActionResponse>

export type UnloaderFn<TData> = (routeMatch: RouteMatch<TData>) => void

export type RouteMatchContext<TData, TActionPayload, TActionResponse> = {
  match: UnloadedMatch<TData, TActionPayload, TActionResponse>
  signal?: AbortSignal
  router: RouterInstance
}

export type RouteActionContext = {
  router: RouterInstance
}

export type RouterState = {
  status: 'idle' | 'loading'
  location: Location
  matches: RouteMatch<unknown>[]
  lastUpdated: number
  loaderData: LoaderData
  action?: ActionState
  actions: Record<string, Action>
  pending?: PendingState
}

export type PendingState = {
  location: Location
  matches: RouteMatch<unknown>[]
}

type PromiseLike<T> = Promise<T> | T

export type ListenerFn = () => void

export type Segment = {
  type: 'pathname' | 'param' | 'wildcard'
  value: string
}

type GetFrameworkGeneric<
  U,
  TData = unknown,
> = U extends keyof FrameworkGenerics<TData>
  ? FrameworkGenerics<TData>[U]
  : unknown

export type __Experimental__RouterSnapshot = {
  location: Location
  matches: SnapshotRouteMatch<unknown>[]
}

export type SnapshotRouteMatch<TData> = {
  id: string
  data: TData
}

export type BuildNextOptions = {
  to?: string | number | null
  search?: true | Updater<SearchSchema>
  hash?: true | Updater<string>
  key?: string
  from?: string
  fromCurrent?: boolean
  __preSearchFilters?: SearchFilter[]
  __postSearchFilters?: SearchFilter[]
}

export type NavigateOptions = BuildNextOptions & {
  replace?: boolean
}

export type LinkOptions = {
  // The absolute or relative destination pathname
  to?: string | number | null
  // The new search object or a function to update it
  search?: true | Updater<SearchSchema>
  // The new has string or a function to update it
  hash?: Updater<string>
  // Whether to replace the current history stack instead of pushing a new one
  replace?: boolean
  // The standard anchor tag target attribute
  target?: HTMLAnchorElement['target']
  // A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  getActiveProps?: () => GetFrameworkGeneric<'LinkProps'>
  // A function that is passed the [Location API](#location-api) and returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  getInactiveProps?: () => GetFrameworkGeneric<'LinkProps'>
  // Defaults to `{ exact: false, includeHash: false }`
  activeOptions?: ActiveOptions
  // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
  preload?: false | 'intent'
  // When preloaded and set, will cache the preloaded result for this duration in milliseconds
  preloadMaxAge?: number
  // Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.
  preloadDelay?: number
  // If true, will render the link without the href attribute
  disabled?: boolean
  // The root (excluding the basepath) from which to resolve the route.
  // Defaults to the current location's pathname.
  // To navigate from the root, pass `/` as the from
  from?: string
}

export type FullLinkOptions = LinkOptions & {
  // This ref is used internally by framework adapters to track mutable state for each link.
  // Passing it in userland is a no-op.
  ref: { preloadTimeout?: null | ReturnType<typeof setTimeout> }
}

type ActiveOptions = {
  exact?: boolean
  includeHash?: boolean
}

export type FilterRoutesFn = (
  routes: ResolvedRoute<unknown, unknown, unknown>[],
) => ResolvedRoute<unknown, unknown, unknown>[]

type Listener = () => void

// Source

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)
// This is the default history object if none is defined
const createDefaultHistory = () =>
  isDOM ? createBrowserHistory() : createMemoryHistory()

const routes = createRoutes([
  {
    path: '/',
    id: 'tanner',
    children: [
      { path: '/', id: 'home' },
      {
        path: 'dashboard',
        loader: async () => {
          return {
            invoices: Promise.resolve('fetchInvoices()'),
          }
        },
        children: [
          { path: '/' },
          {
            path: 'invoices',
            children: [
              {
                path: '/',
                action: async (partialInvoice: 'partialInvoince', ctx) => {
                  const invoice = Promise.resolve('postInvoice(partialInvoice)')

                  // // Redirect to the new invoice
                  // ctx.router.navigate({
                  //   to: invoice.id,
                  //   // Use the current match for relative paths
                  //   from: ctx.match.pathname,
                  // })

                  return invoice
                },
              },
              {
                path: ':invoiceId',
                loader: async ({ params: { invoiceId } }) => {
                  return {
                    invoice: Promise.resolve('fetchInvoiceById(invoiceId!)'),
                  }
                },
                action: (invoice: 'invoice') =>
                  Promise.resolve('invoiceResponse'),
              },
            ],
          },
          {
            path: 'users',
            loader: async () => {
              return {
                users: Promise.resolve('fetchUsers()'),
              }
            },
            // preSearchFilters: [
            //   // Keep the usersView search param around
            //   // while in this route (or it's children!)
            //   (search) => ({
            //     ...search,
            //     usersView: {
            //       ...search.usersView,
            //     },
            //   }),
            // ],
            children: [
              {
                path: ':userId',
                loader: async ({ params: { userId } }) => {
                  return {
                    user: Promise.resolve('fetchUserById(userId!)'),
                  }
                },
              },
            ],
          },
        ],
      },
      {
        // Your elements can be asynchronous, which means you can code-split!
        path: 'expensive',
      },
      // Obviously, you can put routes in other files, too
      // reallyExpensiveRoute,
      {
        path: 'authenticated/',
        children: [
          {
            path: '/',
            // element: <Authenticated />,
          },
        ],
      },
    ],
  },
])

export function createRoutes<TRoutes extends Route[]>(routes: Narrow<TRoutes>) {
  return routes
}

type Try<A, B, C> = A extends B ? A : C

type NarrowRaw<A> =
  | (A extends Function ? A : never)
  | (A extends string | number | bigint | boolean ? A : never)
  | (A extends [] ? [] : never)
  | {
      [K in keyof A]: NarrowRaw<A[K]>
    }

type Narrow<A> = Try<A, [], NarrowRaw<A>>

type RouteLike = {
  path?: string
  children?: RouteLike[]
}

type RoutePaths<T extends RouteLike[]> =
  | '/'
  | {
      [K in keyof T]: `${RoutePath<T[K]>}`
    }[number]

type RoutePath<T extends RouteLike> = HasPath<
  T['path'],
  T['children'] extends RouteLike[]
    ? // Children defined
      T['children']['length'] extends 0
      ? // No children - /path
        `/${CleanPath<T['path']>}`
      : // Has children - /path/...children
        | `/${CleanPath<T['path']>}`
          | `/${CleanPath<T['path']>}${RoutePaths<T['children']>}`
    : // Children not defined - /path
      `/${CleanPath<T['path']>}`,
  T['children'] extends RouteLike[]
    ? // Children defined
      T['children']['length'] extends 0
      ? // No children - /path
        never
      : // Has children - ...children
        `${RoutePaths<T['children']>}`
    : // Children not defined - /path
      never
>

type HasPath<T, Y, N> = CleanPath<T> extends { length: 0 } ? N : Y

type CleanPath<T> = '' extends T
  ? never
  : T extends `/${infer U}`
  ? CleanPath<U>
  : T extends `${infer U}/`
  ? CleanPath<U>
  : T

type Test = RoutePaths<typeof routes>

// type ParseNestedRoutes<T, TFullPath extends string = ''> = T extends Route<
//   any,
//   any,
//   any,
//   string
// >[]
//   ? ParseRoute<T[number], TFullPath>
//   : never

// type ParseRoute<T, TFullPath extends string> = T extends Route<
//   infer A,
//   infer B,
//   infer C,
//   infer TPath,
//   string
// >
//   ?
//       | Route<A, B, C, `${TFullPath}/${TPath}`>
//       | (T extends {
//           children: infer TChildren
//         }
//           ? ParseNestedRoutes<TChildren, `${TFullPath}/${TPath}`>
//           : never)
//   : never

export type MatchRouteOptions = { pending: boolean; caseSensitive?: boolean }

export type LinkInfo = {
  next: Location
  handleFocus: (e: any) => void
  handleClick: (e: any) => void
  handleEnter: (e: any) => void
  handleLeave: (e: any) => void
  activeProps: GetFrameworkGeneric<'LinkProps'>
  inactiveProps: GetFrameworkGeneric<'LinkProps'>
  isActive: boolean
}

export type PreloadCacheEntry = {
  expiresAt: number
  match: RouteMatch<unknown>
}

export type RouterOptions = {
  routes: Route<any, any, any, string>[]
  basepath?: string
} & Partial<
  Pick<RouterInstance, 'history' | 'stringifySearch' | 'parseSearch'>
> &
  Pick<
    RouterInstance,
    | 'filterRoutes'
    | 'defaultLinkPreload'
    | 'defaultLinkPreloadMaxAge'
    | 'defaultLinkPreloadDelay'
    | 'useErrorBoundary'
    | 'defaultElement'
    | 'defaultErrorElement'
    | 'defaultCatchElement'
    | 'defaultPendingElement'
    | 'defaultPendingMs'
    | 'defaultPendingMinMs'
    | 'caseSensitive'
    | '__experimental__snapshot'
  >

export type Action<
  TPayload = unknown,
  TResponse = unknown,
  TError = unknown,
> = {
  submit: (submission?: TPayload) => Promise<TResponse>
  latest?: ActionState
  pending: ActionState<TPayload, TResponse, TError>[]
}

export type ActionState<
  TPayload = unknown,
  TResponse = unknown,
  TError = unknown,
> = {
  submittedAt: number
  status: 'idle' | 'pending' | 'success' | 'error'
  submission: TPayload
  data?: TResponse
  error?: TError
}

export class RouterInstance extends Subscribable {
  history: BrowserHistory | MemoryHistory | HashHistory
  stringifySearch: SearchSerializer
  parseSearch: SearchParser
  filterRoutes?: FilterRoutesFn
  defaultLinkPreload?: false | 'intent'
  defaultLinkPreloadMaxAge?: number
  defaultLinkPreloadDelay?: number
  useErrorBoundary?: boolean
  defaultElement?: GetFrameworkGeneric<'Element'>
  defaultErrorElement?: GetFrameworkGeneric<'Element'>
  defaultCatchElement?: GetFrameworkGeneric<'Element'>
  defaultPendingElement?: GetFrameworkGeneric<'Element'>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  caseSensitive?: boolean
  __experimental__snapshot?: __Experimental__RouterSnapshot

  // Computed in this.update()
  routes!: ResolvedRoute<unknown, unknown, unknown>[]
  basepath!: string
  rootMatch!: Pick<
    RouteMatch<unknown>,
    'id' | 'params' | 'search' | 'pathname' | 'data' | 'data' | 'status'
  >

  // Internal:
  location: Location
  navigateTimeout?: Timeout
  nextAction?: 'push' | 'replace'
  destroy: () => void
  state: RouterState
  isTransitioning: boolean = false
  routesById: Record<string, ResolvedRoute<unknown, unknown, unknown>> = {}
  navigationPromise = Promise.resolve()
  resolveNavigation = () => {}
  startedLoadingAt = Date.now()

  constructor(options?: RouterOptions) {
    super()

    this.history = options?.history || createDefaultHistory()
    this.stringifySearch = options?.stringifySearch ?? defaultStringifySearch
    this.parseSearch = options?.parseSearch ?? defaultParseSearch
    this.location = this.parseLocation(this.history.location)
    this.destroy = this.history.listen((event) => {
      this.loadLocation(this.parseLocation(event.location, this.location))
    })

    this.update(options)

    let matches: RouteMatch<unknown>[] = []

    const __experimental__snapshot = options?.__experimental__snapshot

    if (__experimental__snapshot) {
      // const matches = this.matchRoutes(this.location)
      // matchLoader.matches.forEach((match, index) => {
      //   if (match.id !== __experimental__snapshot.matches[index]?.id) {
      //     throw new Error(
      //       `Router hydration mismatch: ${match.id} !== ${__experimental__snapshot.matches[index]?.id}`,
      //     )
      //   }
      //   match.data = __experimental__snapshot.matches[index]?.data ?? {}
      // })
      // cascadeMatchData(matchLoader.matches)
      // matches = matchLoader.matches
    }

    this.state = {
      status: 'idle',
      location: __experimental__snapshot?.location ?? this.location,
      matches: matches,
      actions: {},
      loaderData: {},
      lastUpdated: Date.now(),
    }
  }

  mount = () => {
    const next = this.buildLocation(this.basepath, {
      to: '.',
      search: true,
      hash: true,
    })

    // If the current location isn't updated, trigger a navigation
    // to the current location. Otherwise, load the current location.
    if (next.href !== this.location.href) {
      return this.commitLocation(next, true)
    } else {
      return this.loadLocation()
    }
  }

  update = (opts: RouterOptions = { routes: [], basepath: '' }) => {
    const { basepath, routes, ...rest } = opts
    Object.assign(this, rest)

    this.basepath = cleanPath(`/${basepath ?? ''}`)

    this.routesById = {}

    this.rootMatch = {
      id: 'root',
      params: {} as any,
      search: {} as any,
      pathname: this.basepath,
      data: {},
      status: 'success',
    }

    this.routes = this.buildRoutes(routes)
  }

  buildRoutes = (routes: Route<unknown, unknown, unknown, string>[]) => {
    const recurseRoutes = (
      routes: Route<any, any, any, string>[],
      parent?: Route<unknown, unknown, unknown, string>,
    ): ResolvedRoute<unknown, unknown, unknown>[] => {
      return routes.map((route) => {
        const path = route.path ?? '*'

        const id = joinPaths([
          parent?.id === 'root' ? '' : parent?.id,
          `${path?.replace(/(.)\/$/, '$1')}${route.id ? `-${route.id}` : ''}`,
        ])

        const resolvedRoute: ResolvedRoute<unknown, unknown, unknown> = {
          ...route,
          children: [],
          pendingMs: route.pendingMs ?? this.defaultPendingMs,
          pendingMinMs: route.pendingMinMs ?? this.defaultPendingMinMs,
          id,
        }

        if (this.routesById[id]) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `Duplicate routes found with id: ${id}`,
              this.routesById,
              resolvedRoute,
            )
          }
          throw new Error()
        }

        this.routesById[id] = resolvedRoute

        resolvedRoute.children = route.children?.length
          ? recurseRoutes(route.children, resolvedRoute)
          : undefined

        return resolvedRoute
      })
    }

    return recurseRoutes(routes ?? [])
  }

  preNotify = () => {
    const match = last(this.state.matches)

    let loaderData = {}

    if (match) {
      const recurse = (m: RouteMatch<any>) => {
        if (m.parentMatch) {
          recurse(m.parentMatch)
        }
        loaderData = { ...loaderData, ...(m.data as any) }
      }

      recurse(match)
    }

    const isPending =
      !!this.state.pending ||
      this.state.matches.find((d) => d.status === 'loading')

    const isLoading =
      isPending ||
      Object.keys(this.state.actions).some(
        (key) => this.state.actions[key]?.pending.length,
      )

    this.state = {
      ...this.state,
      status: isLoading ? 'loading' : 'idle',
      loaderData: replaceEqualDeep(this.state.loaderData, loaderData),
      lastUpdated: Date.now(),
    }
  }

  parseLocation = (
    location: History['location'],
    previousLocation?: Location,
  ): Location => {
    const parsedSearch = this.parseSearch(location.search)

    return {
      pathname: location.pathname,
      searchStr: location.search,
      search: replaceEqualDeep(previousLocation?.search, parsedSearch),
      hash: location.hash.split('#').reverse()[0] ?? '',
      href: `${location.pathname}${location.search}${location.hash}`,
      state: location.state as LocationState,
      key: location.key,
    }
  }

  buildLocation = (
    basepath: string = '/',
    dest: BuildNextOptions = {},
  ): Location => {
    const resolvedFrom: Location = {
      ...this.location,
      pathname: dest.fromCurrent
        ? this.location.pathname
        : dest.from ?? this.location.pathname,
    }

    const pathname = resolvePath(
      basepath,
      resolvedFrom.pathname,
      `${dest.to ?? '.'}`,
    )

    // Pre filters first
    const preFilteredSearch = dest.__preSearchFilters?.length
      ? dest.__preSearchFilters.reduce(
          (prev, next) => next(prev),
          resolvedFrom.search,
        )
      : resolvedFrom.search

    // Then the link/navigate function
    const destSearch =
      dest.search === true
        ? preFilteredSearch // Preserve resolvedFrom true
        : dest.search
        ? functionalUpdate(dest.search, preFilteredSearch) ?? {} // Updater
        : dest.__preSearchFilters?.length
        ? preFilteredSearch // Preserve resolvedFrom filters
        : {}

    // Then post filters
    const postFilteredSearch = dest.__postSearchFilters?.length
      ? dest.__postSearchFilters.reduce((prev, next) => next(prev), destSearch)
      : destSearch

    const search = replaceEqualDeep(resolvedFrom.search, postFilteredSearch)

    const searchStr = this.stringifySearch(search)
    let hash =
      dest.hash === true
        ? resolvedFrom.hash
        : functionalUpdate(dest.hash, resolvedFrom.hash)
    hash = hash ? `#${hash}` : ''

    return {
      pathname,
      search,
      searchStr,
      state: resolvedFrom.state,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: dest.key,
    }
  }

  commitLocation = (next: Location, replace?: boolean): Promise<void> => {
    const id = '' + Date.now() + Math.random()

    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!replace) {
      nextAction = 'push'
    }

    const isSameUrl =
      this.parseLocation(this.history.location).href === next.href

    if (isSameUrl && !next.key) {
      nextAction = 'replace'
    }

    if (nextAction === 'replace') {
      this.history.replace(
        {
          pathname: next.pathname,
          hash: next.hash,
          search: next.searchStr,
        },
        {
          id,
        },
      )
    } else {
      this.history.push(
        {
          pathname: next.pathname,
          hash: next.hash,
          search: next.searchStr,
        },
        {
          id,
        },
      )
    }

    this.navigationPromise = new Promise((resolve) => {
      const previousNavigationResolve = this.resolveNavigation

      this.resolveNavigation = () => {
        previousNavigationResolve()
        resolve()
      }
    })

    return this.navigationPromise
  }

  buildNext = (opts: BuildNextOptions) => {
    const next = this.buildLocation(this.basepath, opts)

    const matches = this.matchRoutes(next)

    const __preSearchFilters = matches
      .map((match) => match.route.preSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    const __postSearchFilters = matches
      .map((match) => match.route.postSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    return this.buildLocation(this.basepath, {
      ...opts,
      __preSearchFilters,
      __postSearchFilters,
    })
  }

  navigate = (
    opts: NavigateOptions,
    // otherOpts?: { resolveEarly?: boolean },
  ) => {
    const next = this.buildNext(opts)
    return this.commitLocation(
      next,
      opts.replace,
      // otherOpts
    )
  }

  cancelMatches = () => {
    ;[...this.state.matches, ...(this.state.pending?.matches ?? [])].forEach(
      (match) => {
        match.cancel()
      },
    )
  }

  loadLocation = async (next?: Location) => {
    const id = Math.random()
    this.startedLoadingAt = id

    if (next) {
      // Ingest the new location
      this.location = next
    }

    // Cancel any pending  matches
    this.cancelMatches()

    // Match the routes
    const unloadedMatches = this.matchRoutes(this.location)
    const resolvedMatches = this.resolveMatches(unloadedMatches)

    this.state = {
      ...this.state,
      pending: {
        matches: resolvedMatches,
        location: this.location,
      },
    }
    this.notify()

    // Load the matches
    const matches = await this.loadMatches(resolvedMatches, {
      withPending: true,
    })

    if (this.startedLoadingAt !== id) {
      console.log('double')
      // Ignore side-effects of match loading
      return this.navigationPromise
    }

    const previousMatches = this.state.matches

    previousMatches
      .filter((d) => {
        return !matches.find((dd) => dd.id === d.id)
      })
      .forEach((d) => {
        d.onExit?.(d)
      })

    previousMatches
      .filter((d) => {
        return matches.find((dd) => dd.id === d.id)
      })
      .forEach((d) => {
        d.route.onTransition?.(d)
      })

    matches
      .filter((d) => {
        return !previousMatches.find((dd) => dd.id === d.id)
      })
      .forEach((d) => {
        d.onExit = d.route.onMatch?.(d)
      })

    this.state = {
      ...this.state,
      location: this.location,
      matches,
      pending: undefined,
    }

    if (matches.some((d) => d.status === 'loading')) {
      this.notify()
      await Promise.all(
        matches.map((d) => d.loaderPromise || Promise.resolve()),
      )
    }
    if (this.startedLoadingAt !== id) {
      // Ignore side-effects of match loading
      return
    }
    this.notify()
    this.resolveNavigation()
  }

  preloadCache: Record<string, PreloadCacheEntry> = {}

  cleanPreloadCache = () => {
    const activeMatchIds = [
      ...(this?.state.matches ?? []),
      ...(this?.state.pending?.matches ?? []),
    ].map((d) => d.id)

    const now = Date.now()

    Object.keys(this.preloadCache).forEach((matchId) => {
      const entry = this.preloadCache[matchId]!

      if (activeMatchIds.includes(matchId)) {
        return
      }

      if (entry.expiresAt < now) {
        delete this.preloadCache[matchId]
      }
    })
  }

  loadRoute = async (
    navigateOpts: NavigateOptions = this.location,
    loaderOpts: { maxAge: number },
  ) => {
    const next = this.buildNext(navigateOpts)
    const unloadedMatches = this.matchRoutes(next)
    const matches = this.resolveMatches(unloadedMatches)
    await this.loadMatches(matches, {
      preload: true,
      maxAge: loaderOpts.maxAge,
    })
    return matches
  }

  matchRoutes = (
    location: Location,
  ): UnloadedMatch<unknown, unknown, unknown>[] => {
    this.cleanPreloadCache()

    const matches: UnloadedMatch<unknown, unknown, unknown>[] = []

    if (!this.routes?.length) {
      return matches
    }

    const recurse = async (
      routes: ResolvedRoute<unknown, unknown, unknown>[],
      parentMatch: UnloadedMatch<unknown, unknown, unknown>,
    ): Promise<void> => {
      let { pathname, params } = parentMatch
      const filteredRoutes = this?.filterRoutes
        ? this?.filterRoutes(routes)
        : routes

      const route = filteredRoutes?.find((route) => {
        const fullRoutePathName = joinPaths([pathname, route.path])

        const fuzzy = !!(route.path !== '/' || route.children?.length)

        const matchParams = matchRoute(location, {
          to: fullRoutePathName,
          search: route.search,
          fuzzy,
          caseSensitive: route.caseSensitive ?? this.caseSensitive,
        })

        if (matchParams) {
          params = {
            ...params,
            ...matchParams,
          }
        }

        return !!matchParams
      })

      if (!route) {
        return
      }

      const interpolatedPath = interpolatePath(route.path, params)
      pathname = joinPaths([pathname, interpolatedPath])

      const interpolatedId = interpolatePath(route.id, params, true)

      const match: UnloadedMatch<unknown, unknown, unknown> = {
        id: interpolatedId,
        route,
        params,
        pathname,
        search: location.search,
      }

      matches.push(match)

      if (route.children?.length) {
        recurse(route.children, match)
      }
    }

    recurse(
      this.routes,
      this.rootMatch as unknown as UnloadedMatch<unknown, unknown, unknown>,
    )

    return matches
  }

  resolveMatches = (
    unloadedMatches: UnloadedMatch<unknown, unknown, unknown>[],
  ): RouteMatch<unknown>[] => {
    if (!unloadedMatches?.length) {
      return []
    }

    const existingMatches = [
      ...this.state.matches,
      ...(this.state.pending?.matches ?? []),
    ]

    const matches = unloadedMatches.map((unloadedMatch, i) => {
      return (
        existingMatches.find((d) => d.id === unloadedMatch.id) ||
        this.preloadCache[unloadedMatch.id]?.match ||
        new RouteMatch(this, unloadedMatch)
      )
    })

    matches.forEach((match, index) => {
      match.setParentMatch(matches[index - 1])
    })

    return matches
  }

  loadMatches = async (
    resolvedMatches: RouteMatch<unknown>[],
    loaderOpts?: { withPending?: boolean } & (
      | { preload: true; maxAge: number }
      | { preload?: false; maxAge?: never }
    ),
  ): Promise<RouteMatch<unknown>[]> => {
    const matchPromises = resolvedMatches.map(async (match) => {
      if (
        (match.status === 'success' && match.isInvalid) ||
        match.status === 'error' ||
        match.status === 'idle'
      ) {
        const promise = match.load()
        if (loaderOpts?.withPending) match.startPending()
        if (loaderOpts?.preload) {
          this.preloadCache[match.id] = {
            expiresAt: Date.now() + loaderOpts?.maxAge!,
            match,
          }
        }
        return promise
      }
    })

    await Promise.all(matchPromises)

    return resolvedMatches
  }

  invalidateRoute = (opts: MatchLocation) => {
    const next = this.buildNext(opts)
    const unloadedMatchIds = this.matchRoutes(next).map((d) => d.id)
    ;[...this.state.matches, ...(this.state.pending?.matches ?? [])].forEach(
      (match) => {
        if (unloadedMatchIds.includes(match.id)) {
          match.isInvalid = true
        }
      },
    )

    if (process.env.NODE_ENV === 'development') {
      this.notify()
    }
  }

  reload = () =>
    this.navigate({
      to: '',
      fromCurrent: true,
      replace: true,
    })

  getAction = <
    TActionPayload = any,
    TActionResponse = unknown,
    TActionError = unknown,
  >(
    matchOpts: Pick<MatchLocation, 'to' | 'from'>,
    opts?: { isActive?: boolean },
  ): Action<TActionPayload, TActionResponse, TActionError> => {
    const next = this.buildNext(matchOpts)
    const matches = this.matchRoutes(next)
    const match = matches.find(
      (d) => d.pathname === next.pathname,
    )! as UnloadedMatch<unknown, TActionPayload, TActionResponse>
    const route = match.route

    if (!route) {
      return {
        submit: (() => {}) as any,
        pending: [],
      }
    }

    let action = (this.state.actions[route.id] ||
      (() => {
        this.state.actions[route.id] = {
          submit: null!,
          pending: [],
        }
        return this.state.actions[route.id]!
      })()) as Action<TActionPayload, TActionResponse, TActionError>

    if (!route.action) {
      throw new Error(
        `Warning: No action was found for "${cleanPath(
          matches.map((d) => d.route.path).join('/'),
        )}". Please add an 'action' option to this route.`,
      )
    }

    Object.assign(action, {
      route,
      submit: async (
        submission?: TActionPayload,
        actionOpts?: { invalidate?: boolean },
      ) => {
        if (!route) {
          return
        }
        const invalidate = actionOpts?.invalidate ?? true

        const actionState: ActionState<
          TActionPayload,
          TActionResponse,
          TActionError
        > = {
          submittedAt: Date.now(),
          status: 'pending',
          submission: submission as TActionPayload,
        }

        action.latest = actionState
        action.pending.push(actionState)

        if (opts?.isActive) {
          this.state.action = actionState as ActionState<
            unknown,
            unknown,
            unknown
          >
        }

        this.notify()

        try {
          const res = await route.action?.(submission, {
            router: this,
          })
          actionState.data = res
          if (invalidate) {
            this.invalidateRoute({ to: '.', fromCurrent: true })
            await this.reload()
          }
          console.log('gone')
          actionState.status = 'success'
          return res
        } catch (err) {
          console.error(err)
          actionState.error = err as TActionError
          actionState.status = 'error'
        } finally {
          action.pending = action.pending.filter((d) => d !== actionState)
          if (actionState === this.state.action) {
            this.state.action = undefined
          }
          this.notify()
        }
      },
    })

    return action
  }

  getOutletElement = (matches: RouteMatch<unknown>[]): JSX.Element => {
    const match = matches[0]

    const element = ((): React.ReactNode => {
      if (!match) {
        return null
      }

      const errorElement = match.errorElement ?? this.defaultErrorElement

      if (match.status === 'error') {
        if (errorElement) {
          return errorElement as any
        }

        if (!this.useErrorBoundary) {
          return 'An unknown/unhandled error occurred!'
        }

        throw match.error
      }

      if (match.status === 'loading' || match.status === 'idle') {
        if (match.isPending) {
          const pendingElement =
            match.pendingElement ?? this.defaultPendingElement

          if (match.route.pendingMs || pendingElement) {
            return (pendingElement as any) ?? null
          }
        }

        return null
      }

      return (match.element as any) ?? this.defaultElement
    })() as JSX.Element

    return element
  }

  resolvePath = (from: string, path: string) => {
    return resolvePath(this.basepath!, from, cleanPath(path))
  }

  matchRoute = (matchLocation: MatchLocation, opts?: MatchRouteOptions) => {
    matchLocation = {
      ...matchLocation,
      to: matchLocation.to
        ? this.resolvePath(
            matchLocation.from || this.rootMatch!.pathname,
            `${matchLocation.to}`,
          )
        : undefined,
    }

    if (opts?.pending) {
      if (!this.state.pending?.location) {
        return undefined
      }
      return matchRoute(this.state.pending.location, matchLocation)
    }

    return matchRoute(this.state.location, matchLocation)
  }

  buildLinkInfo = ({
    to = '.',
    search,
    hash,
    target,
    replace,
    getActiveProps = () => ({ className: 'active' }),
    getInactiveProps = () => ({}),
    activeOptions,
    preload,
    preloadMaxAge: userPreloadMaxAge,
    preloadDelay: userPreloadDelay,
    disabled,
    from,
    ref,
  }: FullLinkOptions): LinkInfo | null => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils
    try {
      new URL(`${to}`)
      return null
    } catch (e) {}

    const next = this.buildNext({
      to,
      search,
      hash,
      from,
    })

    preload = preload ?? this.defaultLinkPreload
    const preloadMaxAge =
      userPreloadMaxAge ?? this.defaultLinkPreloadMaxAge ?? 2000
    const preloadDelay = userPreloadDelay ?? this.defaultLinkPreloadDelay ?? 50

    // Compare path/hash for matches
    const pathIsEqual = this.state.location.pathname === next.pathname
    const currentPathSplit = this.state.location.pathname.split('/')
    const nextPathSplit = next.pathname.split('/')
    const pathIsFuzzyEqual = nextPathSplit.every(
      (d, i) => d === currentPathSplit[i],
    )
    const hashIsEqual = this.state.location.hash === next.hash
    // Combine the matches based on user options
    const pathTest = activeOptions?.exact ? pathIsEqual : pathIsFuzzyEqual
    const hashTest = activeOptions?.includeHash ? hashIsEqual : true

    // The final "active" test
    const isActive = pathTest && hashTest

    // Get the active props
    const activeProps = isActive ? getActiveProps() : {}

    // Get the inactive props
    const inactiveProps = isActive ? {} : getInactiveProps()

    // The click handler
    const handleClick = (e: MouseEvent) => {
      if (
        !disabled &&
        !isCtrlEvent(e) &&
        !e.defaultPrevented &&
        (!target || target === '_self') &&
        e.button === 0
      ) {
        e.preventDefault()
        if (pathIsEqual && !search && !hash) {
          this.invalidateRoute({
            to,
            search,
            from,
          })
        }

        // All is well? Navigate!)
        this.navigate({
          to,
          search,
          hash,
          replace,
          from,
        })
      }
    }

    // The click handler
    const handleFocus = (e: MouseEvent) => {
      if (preload && preloadMaxAge > 0) {
        this.loadRoute(
          {
            to,
            search,
            hash,
            from,
          },
          { maxAge: preloadMaxAge },
        )
      }
    }

    const handleEnter = (e: MouseEvent) => {
      if (preload && preloadMaxAge > 0) {
        if (ref.preloadTimeout) {
          return
        }

        ref.preloadTimeout = setTimeout(() => {
          ref.preloadTimeout = null
          this.loadRoute(
            {
              to,
              search,
              hash,
              from,
            },
            { maxAge: preloadMaxAge },
          )
        }, preloadDelay)
      }
    }

    const handleLeave = (e: MouseEvent) => {
      if (ref.preloadTimeout) {
        clearTimeout(ref.preloadTimeout)
        ref.preloadTimeout = null
      }
    }

    return {
      next,
      handleFocus,
      handleClick,
      handleEnter,
      handleLeave,
      activeProps,
      inactiveProps,
      isActive,
    }
  }

  __experimental__createSnapshot = (): __Experimental__RouterSnapshot => {
    return {
      ...this.state,
      matches: this.state.matches.map(({ data, id }) => {
        return {
          id,
          data,
        }
      }),
    }
  }
}

export class RouteMatch<
  TData = unknown,
  TActionPayload = unknown,
  TActionResponse = unknown,
> {
  id!: string
  router: RouterInstance
  parentMatch?: RouteMatch<any>
  route!: ResolvedRoute<TData, TActionPayload, TActionResponse>
  pathname!: string
  params!: Record<string, string>
  search!: SearchSchema
  updatedAt?: number
  element?: GetFrameworkGeneric<'Element', TData>
  errorElement?: GetFrameworkGeneric<'Element', TData>
  catchElement?: GetFrameworkGeneric<'Element', TData>
  pendingElement?: GetFrameworkGeneric<'Element', TData>
  error?: unknown
  loaderPromise?: Promise<void>
  importPromise?: Promise<void>
  elementsPromise?: Promise<void>
  dataPromise?: Promise<void>
  pendingTimeout?: Timeout
  pendingMinPromise?: Promise<void>
  onExit?: void | ((match: RouteMatch<TData>) => void)
  isInvalid = false

  constructor(
    router: RouterInstance,
    unloadedMatch: UnloadedMatch<TData, TActionPayload, TActionResponse>,
  ) {
    this.router = router
    Object.assign(this, unloadedMatch)
  }

  status: 'idle' | 'loading' | 'success' | 'error' = 'idle'
  data: TData = {} as TData
  isPending: boolean = false
  isFetching: boolean = false
  abortController = new AbortController()
  resolve = () => {}

  notify = () => {
    this.resolve()
    this.router.notify()
  }

  cancel = () => {
    this.abortController?.abort()
    this.cancelPending()
  }

  startPending = () => {
    if (
      this.pendingTimeout ||
      this.status !== 'loading' ||
      typeof this.route.pendingMs === 'undefined'
    ) {
      return
    }

    this.pendingTimeout = setTimeout(() => {
      this.isPending = true
      this.resolve()
      if (typeof this.route.pendingMinMs !== 'undefined') {
        this.pendingMinPromise = new Promise((r) =>
          setTimeout(r, this.route.pendingMinMs),
        )
      }
    }, this.route.pendingMs)
  }

  cancelPending = () => {
    this.isPending = false
    clearTimeout(this.pendingTimeout)
  }

  setParentMatch = (parentMatch?: RouteMatch<TData>) => {
    this.parentMatch = parentMatch
  }

  latestId = ''

  load = () => {
    const id = '' + Date.now() + Math.random()
    this.latestId = id
    // If the match was in an error state, set it
    // to a loading state again. Otherwise, keep it
    // as loading or resolved
    if (this.status === 'error' || this.status === 'idle') {
      this.status = 'loading'
    }

    // We are now fetching, even if it's in the background of a
    // resolved state
    this.isFetching = true

    // We started loading the route, so it's no longer invalid
    this.isInvalid = false

    return new Promise(async (resolve) => {
      this.resolve = resolve as () => void

      const loaderPromise = (async () => {
        const importer = this.route.import

        // First, run any importers
        if (importer) {
          this.importPromise = importer({
            params: this.params,
            search: this.search,
          }).then((imported) => {
            this.route = {
              ...this.route,
              ...imported,
            }
          })
        }

        // Wait for the importer to finish before
        // attempting to load elements and data
        await this.importPromise

        // Next, load the elements and data in parallel

        this.elementsPromise = (async () => {
          // then run all element and data loaders in parallel
          // For each element type, potentially load it asynchronously
          const elementTypes = [
            'element',
            'errorElement',
            'catchElement',
            'pendingElement',
          ] as const

          await Promise.all(
            elementTypes.map(async (type) => {
              const routeElement = this.route[type]

              if (this[type]) {
                return
              }

              if (typeof routeElement === 'function') {
                const res = await (routeElement as any)(this)

                this[type] = res
              } else {
                this[type] = this.route[type] as any
              }
            }),
          )
        })()

        this.dataPromise = Promise.resolve().then(async () => {
          try {
            const data = await this.route.loader?.(this as any, {
              match: this,
              signal: this.abortController.signal,
              router: this.router,
            })
            if (id !== this.latestId) {
              return this.loaderPromise
            }

            this.data = replaceEqualDeep(this.data, data || ({} as TData))
            this.error = undefined
            this.status = 'success'
            this.updatedAt = Date.now()
          } catch (err) {
            if (id !== this.latestId) {
              return this.loaderPromise
            }

            if (process.env.NODE_ENV === 'development') {
              console.error(err)
            }
            this.error = err
            this.status = 'error'
            this.updatedAt = Date.now()
          }
        })

        try {
          await Promise.all([this.elementsPromise, this.dataPromise])
          if (id !== this.latestId) {
            return this.loaderPromise
          }

          if (this.pendingMinPromise) {
            await this.pendingMinPromise
            delete this.pendingMinPromise
          }
        } finally {
          if (id !== this.latestId) {
            return this.loaderPromise
          }
          this.cancelPending()
          this.isPending = false
          this.isFetching = false
          this.notify()
        }
      })()

      this.loaderPromise = loaderPromise
      await loaderPromise

      if (id !== this.latestId) {
        return this.loaderPromise
      }
      delete this.loaderPromise
    })
  }
}

export function matchRoute(
  currentLocation: Pick<Location, 'pathname' | 'search'>,
  matchLocation: Pick<
    MatchLocation,
    'to' | 'search' | 'fuzzy' | 'caseSensitive'
  >,
): RouteParams | undefined {
  const pathParams = matchByPath(currentLocation.pathname, matchLocation)
  const searchMatched = matchBySearch(currentLocation.search, matchLocation)

  if (matchLocation.to && !pathParams) {
    return
  }

  if (matchLocation.search && !searchMatched) {
    return
  }

  return pathParams ?? {}
}

function interpolatePath(
  path: string | undefined,
  params: any,
  leaveWildcard?: boolean,
) {
  const interpolatedPathSegments = parsePathname(path)

  return joinPaths(
    interpolatedPathSegments.map((segment) => {
      if (segment.value === '*' && !leaveWildcard) {
        return ''
      }

      if (segment.type === 'param') {
        return params![segment.value.substring(1)] ?? ''
      }

      return segment.value
    }),
  )
}

export function warning(cond: any, message: string): cond is true {
  if (!cond) {
    if (typeof console !== 'undefined') console.warn(message)

    try {
      throw new Error(message)
    } catch {}
  }

  return true
}

function isFunction(d: any): d is Function {
  return typeof d === 'function'
}

export function functionalUpdate<TResult>(
  updater?: Updater<TResult>,
  previous?: TResult,
) {
  if (isFunction(updater)) {
    return updater(previous as TResult)
  }

  return updater
}

function joinPaths(paths: (string | undefined)[]) {
  return cleanPath(paths.filter(Boolean).join('/'))
}

export function cleanPath(path: string) {
  // remove double slashes
  return `${path}`.replace(/\/{2,}/g, '/')
}

export function matchByPath(
  from: string,
  matchLocation: Pick<MatchLocation, 'to' | 'caseSensitive' | 'fuzzy'>,
): Record<string, string> | undefined {
  const baseSegments = parsePathname(from)
  const routeSegments = parsePathname(`${matchLocation.to ?? '*'}`)

  const params: Record<string, string> = {}

  let isMatch = (() => {
    for (
      let i = 0;
      i < Math.max(baseSegments.length, routeSegments.length);
      i++
    ) {
      const baseSegment = baseSegments[i]
      const routeSegment = routeSegments[i]

      const isLastRouteSegment = i === routeSegments.length - 1
      const isLastBaseSegment = i === baseSegments.length - 1

      if (routeSegment) {
        if (routeSegment.type === 'wildcard') {
          if (baseSegment?.value) {
            params['*'] = joinPaths(baseSegments.slice(i).map((d) => d.value))
            return true
          }
          return false
        }

        if (routeSegment.type === 'pathname') {
          if (routeSegment.value === '/' && !baseSegment?.value) {
            return true
          }

          if (baseSegment) {
            if (matchLocation.caseSensitive) {
              if (routeSegment.value !== baseSegment.value) {
                return false
              }
            } else if (
              routeSegment.value.toLowerCase() !==
              baseSegment.value.toLowerCase()
            ) {
              return false
            }
          }
        }

        if (!baseSegment) {
          return false
        }

        if (routeSegment.type === 'param') {
          params[routeSegment.value.substring(1)] = baseSegment.value
        }
      }

      if (isLastRouteSegment && !isLastBaseSegment) {
        return !!matchLocation.fuzzy
      }
    }
    return true
  })()

  return isMatch ? (params as Record<string, string>) : undefined
}

function matchBySearch(search: SearchSchema, matchLocation: MatchLocation) {
  return !!(matchLocation.search && matchLocation.search(search))
}

export function parsePathname(pathname?: string): Segment[] {
  if (!pathname) {
    return []
  }

  pathname = cleanPath(pathname)

  const segments: Segment[] = []

  if (pathname.slice(0, 1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: 'pathname',
      value: '/',
    })
  }

  if (!pathname) {
    return segments
  }

  // Remove empty segments and '.' segments
  const split = pathname.split('/').filter(Boolean)

  segments.push(
    ...split.map((part): Segment => {
      if (part.startsWith('*')) {
        return {
          type: 'wildcard',
          value: part,
        }
      }

      if (part.charAt(0) === ':') {
        return {
          type: 'param',
          value: part,
        }
      }

      return {
        type: 'pathname',
        value: part,
      }
    }),
  )

  if (pathname.slice(-1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: 'pathname',
      value: '/',
    })
  }

  return segments
}

export function resolvePath(basepath: string, base: string, to: string) {
  base = base.replace(new RegExp(`^${basepath}`), '/')
  to = to.replace(new RegExp(`^${basepath}`), '/')

  let baseSegments = parsePathname(base)
  const toSegments = parsePathname(to)

  toSegments.forEach((toSegment, index) => {
    if (toSegment.value === '/') {
      if (!index) {
        // Leading slash
        baseSegments = [toSegment]
      } else if (index === toSegments.length - 1) {
        // Trailing Slash
        baseSegments.push(toSegment)
      } else {
        // ignore inter-slashes
      }
    } else if (toSegment.value === '..') {
      // Extra trailing slash? pop it off
      if (baseSegments.length > 1 && last(baseSegments)?.value === '/') {
        baseSegments.pop()
      }
      baseSegments.pop()
    } else if (toSegment.value === '.') {
      return
    } else {
      baseSegments.push(toSegment)
    }
  })

  const joined = joinPaths([basepath, ...baseSegments.map((d) => d.value)])

  return cleanPath(joined)
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
export function replaceEqualDeep(prev: any, next: any) {
  if (prev === next) {
    return prev
  }

  const array = Array.isArray(prev) && Array.isArray(next)

  if (array || (isPlainObject(prev) && isPlainObject(next))) {
    const aSize = array ? prev.length : Object.keys(prev).length
    const bItems = array ? next : Object.keys(next)
    const bSize = bItems.length
    const copy: any = array ? [] : {}

    let equalItems = 0

    for (let i = 0; i < bSize; i++) {
      const key = array ? i : bItems[i]
      copy[key] = replaceEqualDeep(prev[key], next[key])
      if (copy[key] === prev[key]) {
        equalItems++
      }
    }

    return aSize === bSize && equalItems === aSize ? prev : copy
  }

  return next
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
function isPlainObject(o: any) {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has modified constructor
  const ctor = o.constructor
  if (typeof ctor === 'undefined') {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Most likely a plain Object
  return true
}

function hasObjectPrototype(o: any) {
  return Object.prototype.toString.call(o) === '[object Object]'
}

export const defaultParseSearch = parseSearchWith(JSON.parse)
export const defaultStringifySearch = stringifySearchWith(JSON.stringify)

export function parseSearchWith(parser: (str: string) => any) {
  return (searchStr: string): Record<string, any> => {
    if (searchStr.substring(0, 1) === '?') {
      searchStr = searchStr.substring(1)
    }

    let query: Record<string, unknown> = decode(searchStr)

    // Try to parse any query params that might be json
    for (let key in query) {
      const value = query[key]
      if (typeof value === 'string') {
        try {
          query[key] = parser(value)
        } catch (err) {
          //
        }
      }
    }

    return query
  }
}

export function stringifySearchWith(stringify: (search: any) => string) {
  return (search: Record<string, any>) => {
    search = { ...search }

    if (search) {
      Object.keys(search).forEach((key) => {
        const val = search[key]
        if (typeof val === 'undefined' || val === undefined) {
          delete search[key]
        } else if (val && typeof val === 'object' && val !== null) {
          try {
            search[key] = stringify(val)
          } catch (err) {
            // silent
          }
        }
      })
    }

    const searchStr = encode(search as Record<string, string>).toString()

    return searchStr ? `?${searchStr}` : ''
  }
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

function last<T>(arr: T[]) {
  return arr[arr.length - 1]
}
