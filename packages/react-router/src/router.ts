import { createBrowserHistory, createMemoryHistory } from '@tanstack/history'
import { Store } from '@tanstack/react-store'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import { rootRouteId } from './root'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import {
  createControlledPromise,
  deepEqual,
  functionalUpdate,
  last,
  pick,
  replaceEqualDeep,
} from './utils'
import {
  cleanPath,
  interpolatePath,
  joinPaths,
  matchPathname,
  parsePathname,
  resolvePath,
  trimPath,
  trimPathLeft,
  trimPathRight,
} from './path'
import { isRedirect, isResolvedRedirect } from './redirects'
import { isNotFound } from './not-found'
import type * as React from 'react'
import type {
  HistoryLocation,
  HistoryState,
  RouterHistory,
} from '@tanstack/history'
import type { NoInfer } from '@tanstack/react-store'
import type { Manifest } from './manifest'
import type {
  AnyContext,
  AnyRoute,
  AnyRouteWithContext,
  AnySearchSchema,
  ErrorRouteComponent,
  LoaderFnContext,
  NotFoundRouteComponent,
  RootRoute,
  RouteComponent,
  RouteMask,
} from './route'
import type {
  FullSearchSchema,
  RouteById,
  RoutePaths,
  RoutesById,
  RoutesByPath,
} from './routeInfo'
import type {
  ControlledPromise,
  NonNullableUpdater,
  PickAsRequired,
  Updater,
} from './utils'
import type {
  AnyRouteMatch,
  MakeRouteMatch,
  MatchRouteOptions,
} from './Matches'
import type { ParsedLocation } from './location'
import type { SearchParser, SearchSerializer } from './searchParams'
import type {
  BuildLocationFn,
  CommitLocationOptions,
  NavigateFn,
} from './RouterProvider'
import type { AnyRedirect, ResolvedRedirect } from './redirects'
import type { NotFoundError } from './not-found'
import type { NavigateOptions, ResolveRelativePath, ToOptions } from './link'

//

declare global {
  interface Window {
    __TSR__?: {
      matches: Array<any>
      streamedValues: Record<
        string,
        {
          value: any
          parsed: any
        }
      >
      cleanScripts: () => void
      dehydrated?: any
    }
    __TSR_ROUTER_CONTEXT__?: React.Context<Router<any, any>>
  }
}

export interface Register {
  // router: Router
}

export type AnyRouter = Router<any, any, any, any>

export type AnyRouterWithContext<TContext> = Router<
  AnyRouteWithContext<TContext>,
  any,
  any,
  any
>

export type RegisteredRouter = Register extends {
  router: infer TRouter extends AnyRouter
}
  ? TRouter
  : AnyRouter

export type HydrationCtx = {
  router: DehydratedRouter
  payload: Record<string, any>
}

export type InferRouterContext<TRouteTree extends AnyRoute> =
  TRouteTree extends RootRoute<
    any,
    any,
    any,
    infer TRouterContext extends AnyContext,
    any,
    any,
    any,
    any
  >
    ? TRouterContext
    : AnyContext

export type RouterContextOptions<TRouteTree extends AnyRoute> =
  AnyContext extends InferRouterContext<TRouteTree>
    ? {
        context?: InferRouterContext<TRouteTree>
      }
    : {
        context: InferRouterContext<TRouteTree>
      }

export type TrailingSlashOption = 'always' | 'never' | 'preserve'

export interface RouterOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDehydrated extends Record<string, any> = Record<string, any>,
  TSerializedError extends Record<string, any> = Record<string, any>,
> {
  /**
   * The history object that will be used to manage the browser history.
   *
   * If not provided, a new createBrowserHistory instance will be created and used.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#history-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/history-types)
   */
  history?: RouterHistory
  /**
   * A function that will be used to stringify search params when generating links.
   *
   * @default defaultStringifySearch
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#stringifysearch-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization)
   */
  stringifySearch?: SearchSerializer
  /**
   * A function that will be used to parse search params when parsing the current location.
   *
   * @default defaultParseSearch
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#parsesearch-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization)
   */
  parseSearch?: SearchParser
  /**
   * If `false`, routes will not be preloaded by default in any way.
   *
   * If `'intent'`, routes will be preloaded by default when the user hovers over a link or a `touchstart` event is detected on a `<Link>`.
   *
   * If `'viewport'`, routes will be preloaded by default when they are within the viewport.
   *
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreload-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)
   */
  defaultPreload?: false | 'intent' | 'viewport'
  /**
   * The delay in milliseconds that a route must be hovered over or touched before it is preloaded.
   *
   * @default 50
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloaddelay-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading#preload-delay)
   */
  defaultPreloadDelay?: number
  /**
   * The default `component` a route should use if no component is provided.
   *
   * @default Outlet
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultcomponent-property)
   */
  defaultComponent?: RouteComponent
  /**
   * The default `errorComponent` a route should use if no error component is provided.
   *
   * @default ErrorComponent
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaulterrorcomponent-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#handling-errors-with-routeoptionserrorcomponent)
   */
  defaultErrorComponent?: ErrorRouteComponent
  /**
   * The default `pendingComponent` a route should use if no pending component is provided.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpendingcomponent-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#showing-a-pending-component)
   */
  defaultPendingComponent?: RouteComponent
  /**
   * The default `pendingMs` a route should use if no pendingMs is provided.
   *
   * @default 1000
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpendingms-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#avoiding-pending-component-flash)
   */
  defaultPendingMs?: number
  /**
   * The default `pendingMinMs` a route should use if no pendingMinMs is provided.
   *
   * @default 500
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpendingminms-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#avoiding-pending-component-flash)
   */
  defaultPendingMinMs?: number
  /**
   * The default `staleTime` a route should use if no staleTime is provided. This is the time in milliseconds that a route will be considered fresh.
   *
   * @default 0
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultstaletime-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#key-options)
   */
  defaultStaleTime?: number
  /**
   * The default `preloadStaleTime` a route should use if no preloadStaleTime is provided.
   *
   * @default 30_000 `(30 seconds)`
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloadstaletime-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)
   */
  defaultPreloadStaleTime?: number
  /**
   * The default `defaultPreloadGcTime` a route should use if no preloadGcTime is provided.
   *
   * @default 1_800_000 `(30 minutes)`
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloadgctime-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)
   */
  defaultPreloadGcTime?: number
  /**
   * The default `onCatch` handler for errors caught by the Router ErrorBoundary
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultoncatch-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#handling-errors-with-routeoptionsoncatch)
   */
  defaultOnCatch?: (error: Error, errorInfo: React.ErrorInfo) => void
  /**
   * If `true`, route navigations will called using `document.startViewTransition()`.
   *
   * If the browser does not support this api, this option will be ignored.
   *
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) for more information on how this function works.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultviewtransition-property)
   */
  defaultViewTransition?: boolean
  /**
   * @default 'fuzzy'
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#notfoundmode-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors#the-notfoundmode-option)
   */
  notFoundMode?: 'root' | 'fuzzy'
  /**
   * The default `gcTime` a route should use if no
   *
   * @default 1_800_000 `(30 minutes)`
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultgctime-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#key-options)
   */
  defaultGcTime?: number
  /**
   * If `true`, all routes will be matched as case-sensitive.
   *
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#casesensitive-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/route-trees#case-sensitivity)
   */
  caseSensitive?: boolean
  /**
   * __Required*__
   *
   * The route tree that will be used to configure the router instance.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#routetree-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/route-trees)
   */
  routeTree?: TRouteTree
  /**
   * The basepath for then entire router. This is useful for mounting a router instance at a subpath.
   *
   * @default '/'
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#basepath-property)
   */
  basepath?: string
  /**
   * The root context that will be provided to all routes in the route tree.
   *
   * This can be used to provide a context to all routes in the tree without having to provide it to each route individually.
   *
   * Optional or required if the root route was created with [`createRootRouteWithContext()`](https://tanstack.com/router/latest/docs/framework/react/api/router/createRootRouteWithContextFunction).
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#context-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/router-context)
   */
  context?: InferRouterContext<TRouteTree>
  /**
   * A function that will be called when the router is dehydrated.
   *
   * The return value of this function will be serialized and stored in the router's dehydrated state.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#dehydrate-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading#critical-dehydrationhydration)
   */
  dehydrate?: () => TDehydrated
  /**
   * A function that will be called when the router is hydrated.
   *
   * The return value of this function will be serialized and stored in the router's dehydrated state.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#hydrate-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading#critical-dehydrationhydration)
   */
  hydrate?: (dehydrated: TDehydrated) => void
  /**
   * An array of route masks that will be used to mask routes in the route tree.
   *
   * Route masking is when you display a route at a different path than the one it is configured to match, like a modal popup that when shared will unmask to the modal's content instead of the modal's context.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#routemasks-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/route-masking)
   */
  routeMasks?: Array<RouteMask<TRouteTree>>
  /**
   * If `true`, route masks will, by default, be removed when the page is reloaded.
   *
   * This can be overridden on a per-mask basis by setting the `unmaskOnReload` option on the mask, or on a per-navigation basis by setting the `unmaskOnReload` option in the `Navigate` options.
   *
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#unmaskonreload-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/route-masking#unmasking-on-page-reload)
   */
  unmaskOnReload?: boolean
  /**
   * A component that will be used to wrap the entire router.
   *
   * This is useful for providing a context to the entire router.
   *
   * Only non-DOM-rendering components like providers should be used, anything else will cause a hydration error.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#wrap-property)
   */
  Wrap?: (props: { children: any }) => React.JSX.Element
  /**
   * A component that will be used to wrap the inner contents of the router.
   *
   * This is useful for providing a context to the inner contents of the router where you also need access to the router context and hooks.
   *
   * Only non-DOM-rendering components like providers should be used, anything else will cause a hydration error.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#innerwrap-property)
   */
  InnerWrap?: (props: { children: any }) => React.JSX.Element
  /**
   * Use `notFoundComponent` instead.
   *
   * @deprecated
   * See https://tanstack.com/router/v1/docs/guide/not-found-errors#migrating-from-notfoundroute for more info.
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#notfoundroute-property)
   */
  notFoundRoute?: AnyRoute
  /**
   * The default `notFoundComponent` a route should use if no notFound component is provided.
   *
   * @default NotFound
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultnotfoundcomponent-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors#default-router-wide-not-found-handling)
   */
  defaultNotFoundComponent?: NotFoundRouteComponent
  /**
   * The transformer that will be used when sending data between the server and the client during SSR.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#transformer-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/ssr#data-transformers)
   */
  transformer?: RouterTransformer
  /**
   * The serializer object that will be used to determine how errors are serialized and deserialized between the server and the client.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#errorserializer-property)
   */
  errorSerializer?: RouterErrorSerializer<TSerializedError>
  /**
   * Configures how trailing slashes are treated.
   *
   * - `'always'` will add a trailing slash if not present
   * - `'never'` will remove the trailing slash if present
   * - `'preserve'` will not modify the trailing slash.
   *
   * @default 'never'
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#trailingslash-property)
   */
  trailingSlash?: TTrailingSlashOption
  /**
   * While usually automatic, sometimes it can be useful to force the router into a server-side state, e.g. when using the router in a non-browser environment that has access to a global.document object.
   *
   * @default typeof document !== 'undefined'
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#isserver property)
   */
  isServer?: boolean
}

export interface RouterTransformer {
  stringify: (obj: unknown) => string
  parse: (str: string) => unknown
}
export interface RouterErrorSerializer<TSerializedError> {
  serialize: (err: unknown) => TSerializedError
  deserialize: (err: TSerializedError) => unknown
}

export interface RouterState<
  TRouteTree extends AnyRoute = AnyRoute,
  TRouteMatch = MakeRouteMatch<TRouteTree>,
> {
  status: 'pending' | 'idle'
  loadedAt: number
  isLoading: boolean
  isTransitioning: boolean
  matches: Array<TRouteMatch>
  pendingMatches?: Array<TRouteMatch>
  cachedMatches: Array<TRouteMatch>
  location: ParsedLocation<FullSearchSchema<TRouteTree>>
  resolvedLocation: ParsedLocation<FullSearchSchema<TRouteTree>>
  statusCode: number
  redirect?: ResolvedRedirect
}

export type ListenerFn<TEvent extends RouterEvent> = (event: TEvent) => void

export interface BuildNextOptions {
  to?: string | number | null
  params?: true | Updater<unknown>
  search?: true | Updater<unknown>
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<HistoryState>
  mask?: {
    to?: string | number | null
    params?: true | Updater<unknown>
    search?: true | Updater<unknown>
    hash?: true | Updater<string>
    state?: true | NonNullableUpdater<HistoryState>
    unmaskOnReload?: boolean
  }
  from?: string
  fromSearch?: unknown
  _fromLocation?: ParsedLocation
}

export interface DehydratedRouterState {
  dehydratedMatches: Array<DehydratedRouteMatch>
}

export type DehydratedRouteMatch = Pick<
  MakeRouteMatch,
  'id' | 'status' | 'updatedAt' | 'loaderData'
>

export interface DehydratedRouter {
  state: DehydratedRouterState
  manifest?: Manifest
}

export type RouterConstructorOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDehydrated extends Record<string, any>,
  TSerializedError extends Record<string, any>,
> = Omit<
  RouterOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDehydrated,
    TSerializedError
  >,
  'context'
> &
  RouterContextOptions<TRouteTree>

export const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
] as const

export type RouterEvents = {
  onBeforeNavigate: {
    type: 'onBeforeNavigate'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
  onBeforeLoad: {
    type: 'onBeforeLoad'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
  onLoad: {
    type: 'onLoad'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
  onResolved: {
    type: 'onResolved'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
}

export type RouterEvent = RouterEvents[keyof RouterEvents]

export type RouterListener<TRouterEvent extends RouterEvent> = {
  eventType: TRouterEvent['type']
  fn: ListenerFn<TRouterEvent>
}

export function createRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDehydrated extends Record<string, any> = Record<string, any>,
  TSerializedError extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDehydrated,
    TSerializedError
  >,
) {
  return new Router<
    TRouteTree,
    TTrailingSlashOption,
    TDehydrated,
    TSerializedError
  >(options)
}

export class Router<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
  in out TSerializedError extends Record<string, any> = Record<string, any>,
> {
  // Option-independent properties
  tempLocationKey: string | undefined = `${Math.round(
    Math.random() * 10000000,
  )}`
  resetNextScroll = true
  shouldViewTransition?: boolean = undefined
  subscribers = new Set<RouterListener<RouterEvent>>()
  dehydratedData?: TDehydrated
  viewTransitionPromise?: ControlledPromise<true>
  manifest?: Manifest
  AfterEachMatch?: (props: {
    match: Pick<
      AnyRouteMatch,
      'id' | 'status' | 'error' | 'loadPromise' | 'minPendingPromise'
    >
    matchIndex: number
  }) => any
  serializeLoaderData?: (
    data: any,
    ctx: {
      router: AnyRouter
      match: AnyRouteMatch
    },
  ) => any
  serializer?: (data: any) => string

  // Must build in constructor
  __store!: Store<RouterState<TRouteTree>>
  options!: PickAsRequired<
    Omit<
      RouterOptions<
        TRouteTree,
        TTrailingSlashOption,
        TDehydrated,
        TSerializedError
      >,
      'transformer'
    > & {
      transformer: RouterTransformer
    },
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: RouterHistory
  latestLocation!: ParsedLocation<FullSearchSchema<TRouteTree>>
  basepath!: string
  routeTree!: TRouteTree
  routesById!: RoutesById<TRouteTree>
  routesByPath!: RoutesByPath<TRouteTree>
  flatRoutes!: Array<AnyRoute>
  isServer!: boolean

  /**
   * @deprecated Use the `createRouter` function instead
   */
  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDehydrated,
      TSerializedError
    >,
  ) {
    this.update({
      defaultPreloadDelay: 50,
      defaultPendingMs: 1000,
      defaultPendingMinMs: 500,
      context: undefined!,
      ...options,
      notFoundMode: options.notFoundMode ?? 'fuzzy',
      stringifySearch: options.stringifySearch ?? defaultStringifySearch,
      parseSearch: options.parseSearch ?? defaultParseSearch,
      transformer: options.transformer ?? {
        parse: JSON.parse,
        stringify: JSON.stringify,
      },
    })

    if (typeof document !== 'undefined') {
      ;(window as any).__TSR__ROUTER__ = this
    }
  }

  // These are default implementations that can optionally be overridden
  // by the router provider once rendered. We provide these so that the
  // router can be used in a non-react environment if necessary
  startReactTransition: (fn: () => void) => void = (fn) => fn()

  update = (
    newOptions: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDehydrated,
      TSerializedError
    >,
  ) => {
    if (newOptions.notFoundRoute) {
      console.warn(
        'The notFoundRoute API is deprecated and will be removed in the next major version. See https://tanstack.com/router/v1/docs/guide/not-found-errors#migrating-from-notfoundroute for more info.',
      )
    }

    const previousOptions = this.options
    this.options = {
      ...this.options,
      ...newOptions,
    }

    this.isServer = this.options.isServer ?? typeof document === 'undefined'

    if (
      !this.basepath ||
      (newOptions.basepath && newOptions.basepath !== previousOptions.basepath)
    ) {
      if (
        newOptions.basepath === undefined ||
        newOptions.basepath === '' ||
        newOptions.basepath === '/'
      ) {
        this.basepath = '/'
      } else {
        this.basepath = `/${trimPath(newOptions.basepath)}`
      }
    }

    if (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      !this.history ||
      (this.options.history && this.options.history !== this.history)
    ) {
      this.history =
        this.options.history ??
        (this.isServer
          ? createMemoryHistory({
              initialEntries: [this.basepath || '/'],
            })
          : createBrowserHistory())
      this.latestLocation = this.parseLocation()
    }

    if (this.options.routeTree !== this.routeTree) {
      this.routeTree = this.options.routeTree as TRouteTree
      this.buildRouteTree()
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!this.__store) {
      this.__store = new Store(getInitialRouterState(this.latestLocation), {
        onUpdate: () => {
          this.__store.state = {
            ...this.state,
            cachedMatches: this.state.cachedMatches.filter(
              (d) => !['redirected'].includes(d.status),
            ),
          }
        },
      })
    }
  }

  get state() {
    return this.__store.state
  }

  buildRouteTree = () => {
    this.routesById = {} as RoutesById<TRouteTree>
    this.routesByPath = {} as RoutesByPath<TRouteTree>

    const notFoundRoute = this.options.notFoundRoute
    if (notFoundRoute) {
      notFoundRoute.init({ originalIndex: 99999999999 })
      ;(this.routesById as any)[notFoundRoute.id] = notFoundRoute
    }

    const recurseRoutes = (childRoutes: Array<AnyRoute>) => {
      childRoutes.forEach((childRoute, i) => {
        childRoute.init({ originalIndex: i })

        const existingRoute = (this.routesById as any)[childRoute.id]

        invariant(
          !existingRoute,
          `Duplicate routes found with id: ${String(childRoute.id)}`,
        )
        ;(this.routesById as any)[childRoute.id] = childRoute

        if (!childRoute.isRoot && childRoute.path) {
          const trimmedFullPath = trimPathRight(childRoute.fullPath)
          if (
            !(this.routesByPath as any)[trimmedFullPath] ||
            childRoute.fullPath.endsWith('/')
          ) {
            ;(this.routesByPath as any)[trimmedFullPath] = childRoute
          }
        }

        const children = childRoute.children

        if (children?.length) {
          recurseRoutes(children)
        }
      })
    }

    recurseRoutes([this.routeTree])

    const scoredRoutes: Array<{
      child: AnyRoute
      trimmed: string
      parsed: ReturnType<typeof parsePathname>
      index: number
      scores: Array<number>
    }> = []

    const routes: Array<AnyRoute> = Object.values(this.routesById)

    routes.forEach((d, i) => {
      if (d.isRoot || !d.path) {
        return
      }

      const trimmed = trimPathLeft(d.fullPath)
      const parsed = parsePathname(trimmed)

      while (parsed.length > 1 && parsed[0]?.value === '/') {
        parsed.shift()
      }

      const scores = parsed.map((segment) => {
        if (segment.value === '/') {
          return 0.75
        }

        if (segment.type === 'param') {
          return 0.5
        }

        if (segment.type === 'wildcard') {
          return 0.25
        }

        return 1
      })

      scoredRoutes.push({ child: d, trimmed, parsed, index: i, scores })
    })

    this.flatRoutes = scoredRoutes
      .sort((a, b) => {
        const minLength = Math.min(a.scores.length, b.scores.length)

        // Sort by min available score
        for (let i = 0; i < minLength; i++) {
          if (a.scores[i] !== b.scores[i]) {
            return b.scores[i]! - a.scores[i]!
          }
        }

        // Sort by length of score
        if (a.scores.length !== b.scores.length) {
          return b.scores.length - a.scores.length
        }

        // Sort by min available parsed value
        for (let i = 0; i < minLength; i++) {
          if (a.parsed[i]!.value !== b.parsed[i]!.value) {
            return a.parsed[i]!.value > b.parsed[i]!.value ? 1 : -1
          }
        }

        // Sort by original index
        return a.index - b.index
      })
      .map((d, i) => {
        d.child.rank = i
        return d.child
      })
  }

  subscribe = <TType extends keyof RouterEvents>(
    eventType: TType,
    fn: ListenerFn<RouterEvents[TType]>,
  ) => {
    const listener: RouterListener<any> = {
      eventType,
      fn,
    }

    this.subscribers.add(listener)

    return () => {
      this.subscribers.delete(listener)
    }
  }

  emit = (routerEvent: RouterEvent) => {
    this.subscribers.forEach((listener) => {
      if (listener.eventType === routerEvent.type) {
        listener.fn(routerEvent)
      }
    })
  }

  parseLocation = (
    previousLocation?: ParsedLocation<FullSearchSchema<TRouteTree>>,
  ): ParsedLocation<FullSearchSchema<TRouteTree>> => {
    const parse = ({
      pathname,
      search,
      hash,
      state,
    }: HistoryLocation): ParsedLocation<FullSearchSchema<TRouteTree>> => {
      const parsedSearch = this.options.parseSearch(search)
      const searchStr = this.options.stringifySearch(parsedSearch)

      return {
        pathname,
        searchStr,
        search: replaceEqualDeep(previousLocation?.search, parsedSearch) as any,
        hash: hash.split('#').reverse()[0] ?? '',
        href: `${pathname}${searchStr}${hash}`,
        state: replaceEqualDeep(previousLocation?.state, state),
      }
    }

    const location = parse(this.history.location)

    const { __tempLocation, __tempKey } = location.state

    if (__tempLocation && (!__tempKey || __tempKey === this.tempLocationKey)) {
      // Sync up the location keys
      const parsedTempLocation = parse(__tempLocation) as any
      parsedTempLocation.state.key = location.state.key

      delete parsedTempLocation.state.__tempLocation

      return {
        ...parsedTempLocation,
        maskedLocation: location,
      }
    }

    return location
  }

  resolvePathWithBase = (from: string, path: string) => {
    const resolvedPath = resolvePath({
      basepath: this.basepath,
      base: from,
      to: cleanPath(path),
      trailingSlash: this.options.trailingSlash,
    })
    return resolvedPath
  }

  get looseRoutesById() {
    return this.routesById as Record<string, AnyRoute>
  }

  matchRoutes = (
    pathname: string,
    locationSearch: AnySearchSchema,
    opts?: { preload?: boolean; throwOnError?: boolean },
  ): Array<AnyRouteMatch> => {
    let routeParams: Record<string, string> = {}

    const foundRoute = this.flatRoutes.find((route) => {
      const matchedParams = matchPathname(
        this.basepath,
        trimPathRight(pathname),
        {
          to: route.fullPath,
          caseSensitive:
            route.options.caseSensitive ?? this.options.caseSensitive,
          fuzzy: true,
        },
      )

      if (matchedParams) {
        routeParams = matchedParams
        return true
      }

      return false
    })

    let routeCursor: AnyRoute =
      foundRoute || (this.routesById as any)[rootRouteId]

    const matchedRoutes: Array<AnyRoute> = [routeCursor]

    let isGlobalNotFound = false

    // Check to see if the route needs a 404 entry
    if (
      // If we found a route, and it's not an index route and we have left over path
      foundRoute
        ? foundRoute.path !== '/' && routeParams['**']
        : // Or if we didn't find a route and we have left over path
          trimPathRight(pathname)
    ) {
      // If the user has defined an (old) 404 route, use it
      if (this.options.notFoundRoute) {
        matchedRoutes.push(this.options.notFoundRoute)
      } else {
        // If there is no routes found during path matching
        isGlobalNotFound = true
      }
    }

    while (routeCursor.parentRoute) {
      routeCursor = routeCursor.parentRoute
      matchedRoutes.unshift(routeCursor)
    }

    const globalNotFoundRouteId = (() => {
      if (!isGlobalNotFound) {
        return undefined
      }

      if (this.options.notFoundMode !== 'root') {
        for (let i = matchedRoutes.length - 1; i >= 0; i--) {
          const route = matchedRoutes[i]!
          if (route.children) {
            return route.id
          }
        }
      }

      return rootRouteId
    })()

    // Existing matches are matches that are already loaded along with
    // pending matches that are still loading

    const parseErrors = matchedRoutes.map((route) => {
      let parsedParamsError

      const parseParams =
        route.options.params?.parse ?? route.options.parseParams

      if (parseParams) {
        try {
          const parsedParams = parseParams(routeParams)
          // Add the parsed params to the accumulated params bag
          Object.assign(routeParams, parsedParams)
        } catch (err: any) {
          parsedParamsError = new PathParamError(err.message, {
            cause: err,
          })

          if (opts?.throwOnError) {
            throw parsedParamsError
          }

          return parsedParamsError
        }
      }

      return
    })

    const matches: Array<AnyRouteMatch> = []

    matchedRoutes.forEach((route, index) => {
      // Take each matched route and resolve + validate its search params
      // This has to happen serially because each route's search params
      // can depend on the parent route's search params
      // It must also happen before we create the match so that we can
      // pass the search params to the route's potential key function
      // which is used to uniquely identify the route match in state

      const parentMatch = matches[index - 1]

      const [preMatchSearch, searchError]: [Record<string, any>, any] = (() => {
        // Validate the search params and stabilize them
        const parentSearch = parentMatch?.search ?? locationSearch

        try {
          const validator =
            typeof route.options.validateSearch === 'object'
              ? route.options.validateSearch.parse
              : route.options.validateSearch

          const search = validator?.(parentSearch) ?? {}

          return [
            {
              ...parentSearch,
              ...search,
            },
            undefined,
          ]
        } catch (err: any) {
          const searchParamError = new SearchParamError(err.message, {
            cause: err,
          })

          if (opts?.throwOnError) {
            throw searchParamError
          }

          return [parentSearch, searchParamError]
        }
      })()

      // This is where we need to call route.options.loaderDeps() to get any additional
      // deps that the route's loader function might need to run. We need to do this
      // before we create the match so that we can pass the deps to the route's
      // potential key function which is used to uniquely identify the route match in state

      const loaderDeps =
        route.options.loaderDeps?.({
          search: preMatchSearch,
        }) ?? ''

      const loaderDepsHash = loaderDeps ? JSON.stringify(loaderDeps) : ''

      const interpolatedPath = interpolatePath({
        path: route.fullPath,
        params: routeParams,
      })

      const matchId =
        interpolatePath({
          path: route.id,
          params: routeParams,
          leaveWildcards: true,
        }) + loaderDepsHash

      // Waste not, want not. If we already have a match for this route,
      // reuse it. This is important for layout routes, which might stick
      // around between navigation actions that only change leaf routes.
      const existingMatch = this.getMatch(matchId)

      const cause = this.state.matches.find((d) => d.id === matchId)
        ? 'stay'
        : 'enter'

      let match: AnyRouteMatch

      if (existingMatch) {
        match = {
          ...existingMatch,
          cause,
          params: routeParams,
        }
      } else {
        const status =
          route.options.loader || route.options.beforeLoad || route.lazyFn
            ? 'pending'
            : 'success'

        match = {
          id: matchId,
          index,
          routeId: route.id,
          params: routeParams,
          pathname: joinPaths([this.basepath, interpolatedPath]),
          updatedAt: Date.now(),
          search: {} as any,
          searchError: undefined,
          status,
          isFetching: false,
          error: undefined,
          paramsError: parseErrors[index],
          routeContext: undefined!,
          context: undefined!,
          abortController: new AbortController(),
          fetchCount: 0,
          cause,
          loaderDeps,
          invalid: false,
          preload: false,
          links: route.options.links?.(),
          scripts: route.options.scripts?.(),
          staticData: route.options.staticData || {},
          loadPromise: createControlledPromise(),
        }
      }

      // If it's already a success, update the meta and headers
      // These may get updated again if the match is refreshed
      // due to being stale
      if (match.status === 'success') {
        match.meta = route.options.meta?.({
          matches,
          match,
          params: match.params,
          loaderData: match.loaderData,
        })

        match.headers = route.options.headers?.({
          loaderData: match.loaderData,
        })
      }

      if (!opts?.preload) {
        // If we have a global not found, mark the right match as global not found
        match.globalNotFound = globalNotFoundRouteId === route.id
      }

      // Regardless of whether we're reusing an existing match or creating
      // a new one, we need to update the match's search params
      match.search = replaceEqualDeep(match.search, preMatchSearch)
      // And also update the searchError if there is one
      match.searchError = searchError

      matches.push(match)
    })

    return matches as any
  }

  cancelMatch = (id: string) => {
    const match = this.getMatch(id)

    if (!match) return

    match.abortController.abort()
    clearTimeout(match.pendingTimeout)
  }

  cancelMatches = () => {
    this.state.pendingMatches?.forEach((match) => {
      this.cancelMatch(match.id)
    })
  }

  buildLocation: BuildLocationFn = (opts) => {
    const build = (
      dest: BuildNextOptions & {
        unmaskOnReload?: boolean
      } = {},
      matches?: Array<MakeRouteMatch<TRouteTree>>,
    ): ParsedLocation => {
      const fromMatches =
        dest._fromLocation != null
          ? this.matchRoutes(
              dest._fromLocation.pathname,
              dest.fromSearch || dest._fromLocation.search,
            )
          : this.state.matches

      const fromMatch =
        dest.from != null
          ? fromMatches.find((d) =>
              matchPathname(this.basepath, trimPathRight(d.pathname), {
                to: dest.from,
                caseSensitive: false,
                fuzzy: false,
              }),
            )
          : undefined

      const fromPath = fromMatch?.pathname || this.latestLocation.pathname

      invariant(
        dest.from == null || fromMatch != null,
        'Could not find match for from: ' + dest.from,
      )

      const fromSearch = last(fromMatches)?.search || this.latestLocation.search

      const stayingMatches = matches?.filter((d) =>
        fromMatches.find((e) => e.routeId === d.routeId),
      )

      const fromRouteByFromPathRouteId =
        this.routesById[
          stayingMatches?.find((d) => d.pathname === fromPath)?.routeId
        ]

      let pathname = dest.to
        ? this.resolvePathWithBase(fromPath, `${dest.to}`)
        : this.resolvePathWithBase(
            fromPath,
            fromRouteByFromPathRouteId?.to ?? fromPath,
          )

      const prevParams = { ...last(fromMatches)?.params }

      let nextParams =
        (dest.params ?? true) === true
          ? prevParams
          : { ...prevParams, ...functionalUpdate(dest.params, prevParams) }

      if (Object.keys(nextParams).length > 0) {
        matches
          ?.map((d) => {
            const route = this.looseRoutesById[d.routeId]
            return (
              route?.options.params?.stringify ?? route!.options.stringifyParams
            )
          })
          .filter(Boolean)
          .forEach((fn) => {
            nextParams = { ...nextParams!, ...fn!(nextParams) }
          })
      }

      pathname = interpolatePath({
        path: pathname,
        params: nextParams ?? {},
        leaveWildcards: false,
        leaveParams: opts.leaveParams,
      })

      const preSearchFilters =
        stayingMatches
          ?.map(
            (match) =>
              this.looseRoutesById[match.routeId]!.options.preSearchFilters ??
              [],
          )
          .flat()
          .filter(Boolean) ?? []

      const postSearchFilters =
        stayingMatches
          ?.map(
            (match) =>
              this.looseRoutesById[match.routeId]!.options.postSearchFilters ??
              [],
          )
          .flat()
          .filter(Boolean) ?? []

      // Pre filters first
      const preFilteredSearch = preSearchFilters.length
        ? preSearchFilters.reduce((prev, next) => next(prev), fromSearch)
        : fromSearch

      // Then the link/navigate function
      const destSearch =
        dest.search === true
          ? preFilteredSearch // Preserve resolvedFrom true
          : dest.search
            ? functionalUpdate(dest.search, preFilteredSearch) // Updater
            : preSearchFilters.length
              ? preFilteredSearch // Preserve resolvedFrom filters
              : {}

      // Then post filters
      const postFilteredSearch = postSearchFilters.length
        ? postSearchFilters.reduce((prev, next) => next(prev), destSearch)
        : destSearch

      const search = replaceEqualDeep(fromSearch, postFilteredSearch)

      const searchStr = this.options.stringifySearch(search)

      const hash =
        dest.hash === true
          ? this.latestLocation.hash
          : dest.hash
            ? functionalUpdate(dest.hash, this.latestLocation.hash)
            : undefined

      const hashStr = hash ? `#${hash}` : ''

      let nextState =
        dest.state === true
          ? this.latestLocation.state
          : dest.state
            ? functionalUpdate(dest.state, this.latestLocation.state)
            : {}

      nextState = replaceEqualDeep(this.latestLocation.state, nextState)

      return {
        pathname,
        search,
        searchStr,
        state: nextState as any,
        hash: hash ?? '',
        href: `${pathname}${searchStr}${hashStr}`,
        unmaskOnReload: dest.unmaskOnReload,
      }
    }

    const buildWithMatches = (
      dest: BuildNextOptions = {},
      maskedDest?: BuildNextOptions,
    ) => {
      const next = build(dest)
      let maskedNext = maskedDest ? build(maskedDest) : undefined

      if (!maskedNext) {
        let params = {}

        const foundMask = this.options.routeMasks?.find((d) => {
          const match = matchPathname(this.basepath, next.pathname, {
            to: d.from,
            caseSensitive: false,
            fuzzy: false,
          })

          if (match) {
            params = match
            return true
          }

          return false
        })

        if (foundMask) {
          const { from, ...maskProps } = foundMask
          maskedDest = {
            ...pick(opts, ['from']),
            ...maskProps,
            params,
          }
          maskedNext = build(maskedDest)
        }
      }

      const nextMatches = this.matchRoutes(next.pathname, next.search)
      const maskedMatches = maskedNext
        ? this.matchRoutes(maskedNext.pathname, maskedNext.search)
        : undefined
      const maskedFinal = maskedNext
        ? build(maskedDest, maskedMatches)
        : undefined

      const final = build(dest, nextMatches)

      if (maskedFinal) {
        final.maskedLocation = maskedFinal
      }

      return final
    }

    if (opts.mask) {
      return buildWithMatches(opts, {
        ...pick(opts, ['from']),
        ...opts.mask,
      })
    }

    return buildWithMatches(opts)
  }

  commitLocationPromise: undefined | ControlledPromise<void>

  commitLocation = ({
    viewTransition,
    ignoreBlocker,
    ...next
  }: ParsedLocation & CommitLocationOptions): Promise<void> => {
    const isSameState = () => {
      // `state.key` is ignored but may still be provided when navigating,
      // temporarily add the previous key to the next state so it doesn't affect
      // the comparison

      next.state.key = this.latestLocation.state.key
      const isEqual = deepEqual(next.state, this.latestLocation.state)
      delete next.state.key
      return isEqual
    }

    const isSameUrl = this.latestLocation.href === next.href

    const previousCommitPromise = this.commitLocationPromise
    this.commitLocationPromise = createControlledPromise<void>(() => {
      previousCommitPromise?.resolve()
    })

    // Don't commit to history if nothing changed
    if (isSameUrl && isSameState()) {
      this.load()
    } else {
      // eslint-disable-next-line prefer-const
      let { maskedLocation, ...nextHistory } = next

      if (maskedLocation) {
        nextHistory = {
          ...maskedLocation,
          state: {
            ...maskedLocation.state,
            __tempKey: undefined,
            __tempLocation: {
              ...nextHistory,
              search: nextHistory.searchStr,
              state: {
                ...nextHistory.state,
                __tempKey: undefined!,
                __tempLocation: undefined!,
                key: undefined!,
              },
            },
          },
        }

        if (
          nextHistory.unmaskOnReload ??
          this.options.unmaskOnReload ??
          false
        ) {
          nextHistory.state.__tempKey = this.tempLocationKey
        }
      }

      this.shouldViewTransition = viewTransition

      this.history[next.replace ? 'replace' : 'push'](
        nextHistory.href,
        nextHistory.state,
        { ignoreBlocker },
      )
    }

    this.resetNextScroll = next.resetScroll ?? true

    if (!this.history.subscribers.size) {
      this.load()
    }

    return this.commitLocationPromise
  }

  buildAndCommitLocation = ({
    replace,
    resetScroll,
    viewTransition,
    ignoreBlocker,
    ...rest
  }: BuildNextOptions & CommitLocationOptions = {}) => {
    const location = this.buildLocation(rest as any)
    return this.commitLocation({
      ...location,
      viewTransition,
      replace,
      resetScroll,
      ignoreBlocker,
    })
  }

  navigate: NavigateFn = ({ from, to, __isRedirect, ...rest }) => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils
    const toString = String(to)
    // const fromString = from !== undefined ? String(from) : from
    let isExternal

    try {
      new URL(`${toString}`)
      isExternal = true
    } catch (e) {}

    invariant(
      !isExternal,
      'Attempting to navigate to external url with router.navigate!',
    )

    return this.buildAndCommitLocation({
      ...rest,
      from,
      to,
      // to: toString,
    })
  }

  latestLoadPromise: undefined | Promise<void>

  load = async (): Promise<void> => {
    this.latestLocation = this.parseLocation(this.latestLocation)

    this.__store.setState((s) => ({
      ...s,
      loadedAt: Date.now(),
    }))

    let redirect: ResolvedRedirect | undefined
    let notFound: NotFoundError | undefined

    const loadPromise = new Promise<void>((resolve) => {
      this.startReactTransition(async () => {
        try {
          const next = this.latestLocation
          const prevLocation = this.state.resolvedLocation
          const pathDidChange = prevLocation.href !== next.href

          // Cancel any pending matches
          this.cancelMatches()

          let pendingMatches!: Array<AnyRouteMatch>

          this.__store.batch(() => {
            // this call breaks a route context of destination route after a redirect
            // we should be fine not eagerly calling this since we call it later
            // this.cleanCache()

            // Match the routes
            pendingMatches = this.matchRoutes(next.pathname, next.search)

            // Ingest the new matches
            this.__store.setState((s) => ({
              ...s,
              status: 'pending',
              isLoading: true,
              location: next,
              pendingMatches,
              // If a cached moved to pendingMatches, remove it from cachedMatches
              cachedMatches: s.cachedMatches.filter((d) => {
                return !pendingMatches.find((e) => e.id === d.id)
              }),
            }))
          })

          if (!this.state.redirect) {
            this.emit({
              type: 'onBeforeNavigate',
              fromLocation: prevLocation,
              toLocation: next,
              pathChanged: pathDidChange,
            })
          }

          this.emit({
            type: 'onBeforeLoad',
            fromLocation: prevLocation,
            toLocation: next,
            pathChanged: pathDidChange,
          })

          await this.loadMatches({
            matches: pendingMatches,
            location: next,
            // eslint-disable-next-line @typescript-eslint/require-await
            onReady: async () => {
              // eslint-disable-next-line @typescript-eslint/require-await
              this.startViewTransition(async () => {
                // this.viewTransitionPromise = createControlledPromise<true>()

                // Commit the pending matches. If a previous match was
                // removed, place it in the cachedMatches
                let exitingMatches!: Array<AnyRouteMatch>
                let enteringMatches!: Array<AnyRouteMatch>
                let stayingMatches!: Array<AnyRouteMatch>

                this.__store.batch(() => {
                  this.__store.setState((s) => {
                    const previousMatches = s.matches
                    const newMatches = s.pendingMatches || s.matches

                    exitingMatches = previousMatches.filter(
                      (match) => !newMatches.find((d) => d.id === match.id),
                    )
                    enteringMatches = newMatches.filter(
                      (match) =>
                        !previousMatches.find((d) => d.id === match.id),
                    )
                    stayingMatches = previousMatches.filter((match) =>
                      newMatches.find((d) => d.id === match.id),
                    )

                    return {
                      ...s,
                      isLoading: false,
                      matches: newMatches,
                      pendingMatches: undefined,
                      cachedMatches: [
                        ...s.cachedMatches,
                        ...exitingMatches.filter((d) => d.status !== 'error'),
                      ],
                    }
                  })
                  this.cleanCache()
                })

                //
                ;(
                  [
                    [exitingMatches, 'onLeave'],
                    [enteringMatches, 'onEnter'],
                    [stayingMatches, 'onStay'],
                  ] as const
                ).forEach(([matches, hook]) => {
                  matches.forEach((match) => {
                    this.looseRoutesById[match.routeId]!.options[hook]?.(match)
                  })
                })
              })
            },
          })
        } catch (err) {
          if (isResolvedRedirect(err)) {
            redirect = err
            if (!this.isServer) {
              this.navigate({ ...err, replace: true, __isRedirect: true })
            }
          } else if (isNotFound(err)) {
            notFound = err
          }

          this.__store.setState((s) => ({
            ...s,
            statusCode: redirect
              ? redirect.statusCode
              : notFound
                ? 404
                : s.matches.some((d) => d.status === 'error')
                  ? 500
                  : 200,
            redirect,
          }))
        }

        if (this.latestLoadPromise === loadPromise) {
          this.commitLocationPromise?.resolve()
          this.latestLoadPromise = undefined
          this.commitLocationPromise = undefined
        }
        resolve()
      })
    })

    this.latestLoadPromise = loadPromise

    await loadPromise

    while (
      (this.latestLoadPromise as any) &&
      loadPromise !== this.latestLoadPromise
    ) {
      await this.latestLoadPromise
    }
  }

  startViewTransition = (fn: () => Promise<void>) => {
    // Determine if we should start a view transition from the navigation
    // or from the router default
    const shouldViewTransition =
      this.shouldViewTransition ?? this.options.defaultViewTransition

    // Reset the view transition flag
    delete this.shouldViewTransition
    // Attempt to start a view transition (or just apply the changes if we can't)
    ;(shouldViewTransition && typeof document !== 'undefined'
      ? document
      : undefined
    )
      // @ts-expect-error
      ?.startViewTransition?.(fn) || fn()
  }

  updateMatch = (
    id: string,
    updater: (match: AnyRouteMatch) => AnyRouteMatch,
  ) => {
    let updated!: AnyRouteMatch
    const isPending = this.state.pendingMatches?.find((d) => d.id === id)
    const isMatched = this.state.matches.find((d) => d.id === id)

    const matchesKey = isPending
      ? 'pendingMatches'
      : isMatched
        ? 'matches'
        : 'cachedMatches'

    this.__store.setState((s) => ({
      ...s,
      [matchesKey]: s[matchesKey]?.map((d) =>
        d.id === id ? (updated = updater(d)) : d,
      ),
    }))

    return updated
  }

  getMatch = (matchId: string) => {
    return [
      ...this.state.cachedMatches,
      ...(this.state.pendingMatches ?? []),
      ...this.state.matches,
    ].find((d) => d.id === matchId)
  }

  loadMatches = async ({
    location,
    matches,
    preload,
    onReady,
    updateMatch = this.updateMatch,
  }: {
    location: ParsedLocation
    matches: Array<AnyRouteMatch>
    preload?: boolean
    onReady?: () => Promise<void>
    updateMatch?: (
      id: string,
      updater: (match: AnyRouteMatch) => AnyRouteMatch,
    ) => void
    getMatch?: (matchId: string) => AnyRouteMatch | undefined
  }): Promise<Array<MakeRouteMatch>> => {
    let firstBadMatchIndex: number | undefined
    let rendered = false

    const triggerOnReady = async () => {
      if (!rendered) {
        rendered = true
        await onReady?.()
      }
    }

    if (!this.isServer && !this.state.matches.length) {
      triggerOnReady()
    }

    const handleRedirectAndNotFound = (match: AnyRouteMatch, err: any) => {
      if (isResolvedRedirect(err)) throw err

      if (isRedirect(err) || isNotFound(err)) {
        updateMatch(match.id, (prev) => ({
          ...prev,
          status: isRedirect(err)
            ? 'redirected'
            : isNotFound(err)
              ? 'notFound'
              : 'error',
          isFetching: false,
          error: err,
          beforeLoadPromise: undefined,
          loaderPromise: undefined,
        }))

        if (!(err as any).routeId) {
          ;(err as any).routeId = match.routeId
        }

        match.beforeLoadPromise?.resolve()
        match.loaderPromise?.resolve()
        match.loadPromise?.resolve()

        if (isRedirect(err)) {
          rendered = true
          err = this.resolveRedirect({ ...err, _fromLocation: location })
          throw err
        } else if (isNotFound(err)) {
          this._handleNotFound(matches, err, {
            updateMatch,
          })
          throw err
        }
      }
    }

    try {
      await new Promise<void>((resolveAll, rejectAll) => {
        ;(async () => {
          try {
            const handleSerialError = (
              index: number,
              err: any,
              routerCode: string,
            ) => {
              const { id: matchId, routeId } = matches[index]!
              const route = this.looseRoutesById[routeId]!

              // Much like suspense, we use a promise here to know if
              // we've been outdated by a new loadMatches call and
              // should abort the current async operation
              if (err instanceof Promise) {
                throw err
              }

              err.routerCode = routerCode
              firstBadMatchIndex = firstBadMatchIndex ?? index
              handleRedirectAndNotFound(this.getMatch(matchId)!, err)

              try {
                route.options.onError?.(err)
              } catch (errorHandlerErr) {
                err = errorHandlerErr
                handleRedirectAndNotFound(this.getMatch(matchId)!, err)
              }

              updateMatch(matchId, (prev) => {
                prev.beforeLoadPromise?.resolve()

                return {
                  ...prev,
                  error: err,
                  status: 'error',
                  isFetching: false,
                  updatedAt: Date.now(),
                  abortController: new AbortController(),
                  beforeLoadPromise: undefined,
                }
              })
            }

            for (const [index, { id: matchId, routeId }] of matches.entries()) {
              const existingMatch = this.getMatch(matchId)!

              if (
                // If we are in the middle of a load, either of these will be present
                // (not to be confused with `loadPromise`, which is always defined)
                existingMatch.beforeLoadPromise ||
                existingMatch.loaderPromise
              ) {
                // Wait for the beforeLoad to resolve before we continue
                await existingMatch.beforeLoadPromise
              } else {
                // If we are not in the middle of a load, start it
                try {
                  updateMatch(matchId, (prev) => ({
                    ...prev,
                    loadPromise: createControlledPromise<void>(() => {
                      prev.loadPromise?.resolve()
                    }),
                    beforeLoadPromise: createControlledPromise<void>(),
                  }))

                  const route = this.looseRoutesById[routeId]!
                  const abortController = new AbortController()

                  const parentMatchId = matches[index - 1]?.id

                  const getParentContext = () => {
                    if (!parentMatchId) {
                      return (this.options.context as any) ?? {}
                    }

                    return (
                      this.getMatch(parentMatchId)!.context ??
                      this.options.context ??
                      {}
                    )
                  }

                  const pendingMs =
                    route.options.pendingMs ?? this.options.defaultPendingMs

                  const shouldPending = !!(
                    onReady &&
                    !this.isServer &&
                    !preload &&
                    (route.options.loader || route.options.beforeLoad) &&
                    typeof pendingMs === 'number' &&
                    pendingMs !== Infinity &&
                    (route.options.pendingComponent ??
                      this.options.defaultPendingComponent)
                  )

                  let pendingTimeout: ReturnType<typeof setTimeout>

                  if (shouldPending) {
                    // If we might show a pending component, we need to wait for the
                    // pending promise to resolve before we start showing that state
                    pendingTimeout = setTimeout(() => {
                      try {
                        // Update the match and prematurely resolve the loadMatches promise so that
                        // the pending component can start rendering
                        triggerOnReady()
                      } catch {}
                    }, pendingMs)
                  }

                  const { paramsError, searchError } = this.getMatch(matchId)!

                  if (paramsError) {
                    handleSerialError(index, paramsError, 'PARSE_PARAMS')
                  }

                  if (searchError) {
                    handleSerialError(index, searchError, 'VALIDATE_SEARCH')
                  }

                  const parentContext = getParentContext()

                  updateMatch(matchId, (prev) => ({
                    ...prev,
                    isFetching: 'beforeLoad',
                    fetchCount: prev.fetchCount + 1,
                    routeContext: replaceEqualDeep(
                      prev.routeContext,
                      parentContext,
                    ),
                    context: replaceEqualDeep(prev.context, parentContext),
                    abortController,
                    pendingTimeout,
                  }))

                  const { search, params, routeContext, cause } =
                    this.getMatch(matchId)!

                  const beforeLoadFnContext = {
                    search,
                    abortController,
                    params,
                    preload: !!preload,
                    context: routeContext,
                    location,
                    navigate: (opts: any) =>
                      this.navigate({ ...opts, _fromLocation: location }),
                    buildLocation: this.buildLocation,
                    cause: preload ? 'preload' : cause,
                  }

                  const beforeLoadContext =
                    (await route.options.beforeLoad?.(beforeLoadFnContext)) ??
                    {}

                  if (
                    isRedirect(beforeLoadContext) ||
                    isNotFound(beforeLoadContext)
                  ) {
                    handleSerialError(index, beforeLoadContext, 'BEFORE_LOAD')
                  }

                  updateMatch(matchId, (prev) => {
                    const routeContext = {
                      ...prev.routeContext,
                      ...beforeLoadContext,
                    }

                    return {
                      ...prev,
                      routeContext: replaceEqualDeep(
                        prev.routeContext,
                        routeContext,
                      ),
                      context: replaceEqualDeep(prev.context, routeContext),
                      abortController,
                    }
                  })
                } catch (err) {
                  handleSerialError(index, err, 'BEFORE_LOAD')
                }

                updateMatch(matchId, (prev) => {
                  prev.beforeLoadPromise?.resolve()

                  return {
                    ...prev,
                    beforeLoadPromise: undefined,
                    isFetching: false,
                  }
                })
              }
            }

            const validResolvedMatches = matches.slice(0, firstBadMatchIndex)
            const matchPromises: Array<Promise<any>> = []

            validResolvedMatches.forEach(({ id: matchId, routeId }, index) => {
              matchPromises.push(
                (async () => {
                  const { loaderPromise: prevLoaderPromise } =
                    this.getMatch(matchId)!

                  if (prevLoaderPromise) {
                    await prevLoaderPromise
                  } else {
                    const parentMatchPromise = matchPromises[index - 1]
                    const route = this.looseRoutesById[routeId]!

                    const getLoaderContext = (): LoaderFnContext => {
                      const {
                        params,
                        loaderDeps,
                        abortController,
                        context,
                        cause,
                      } = this.getMatch(matchId)!

                      return {
                        params,
                        deps: loaderDeps,
                        preload: !!preload,
                        parentMatchPromise,
                        abortController: abortController,
                        context,
                        location,
                        navigate: (opts) =>
                          this.navigate({ ...opts, _fromLocation: location }),
                        cause: preload ? 'preload' : cause,
                        route,
                      }
                    }

                    // This is where all of the stale-while-revalidate magic happens
                    const age = Date.now() - this.getMatch(matchId)!.updatedAt

                    const staleAge = preload
                      ? (route.options.preloadStaleTime ??
                        this.options.defaultPreloadStaleTime ??
                        30_000) // 30 seconds for preloads by default
                      : (route.options.staleTime ??
                        this.options.defaultStaleTime ??
                        0)

                    const shouldReloadOption = route.options.shouldReload

                    // Default to reloading the route all the time
                    // Allow shouldReload to get the last say,
                    // if provided.
                    const shouldReload =
                      typeof shouldReloadOption === 'function'
                        ? shouldReloadOption(getLoaderContext())
                        : shouldReloadOption

                    updateMatch(matchId, (prev) => ({
                      ...prev,
                      loaderPromise: createControlledPromise<void>(),
                      preload:
                        !!preload &&
                        !this.state.matches.find((d) => d.id === matchId),
                    }))

                    const runLoader = async () => {
                      try {
                        // If the Matches component rendered
                        // the pending component and needs to show it for
                        // a minimum duration, we''ll wait for it to resolve
                        // before committing to the match and resolving
                        // the loadPromise
                        const potentialPendingMinPromise = async () => {
                          const latestMatch = this.getMatch(matchId)!

                          if (latestMatch.minPendingPromise) {
                            await latestMatch.minPendingPromise
                          }
                        }

                        // Actually run the loader and handle the result
                        try {
                          route._lazyPromise =
                            route._lazyPromise ||
                            (route.lazyFn
                              ? route.lazyFn().then((lazyRoute) => {
                                  Object.assign(
                                    route.options,
                                    lazyRoute.options,
                                  )
                                })
                              : Promise.resolve())

                          // If for some reason lazy resolves more lazy components...
                          // We'll wait for that before pre attempt to preload any
                          // components themselves.
                          const componentsPromise =
                            this.getMatch(matchId)!.componentsPromise ||
                            route._lazyPromise.then(() =>
                              Promise.all(
                                componentTypes.map(async (type) => {
                                  const component = route.options[type]

                                  if ((component as any)?.preload) {
                                    await (component as any).preload()
                                  }
                                }),
                              ),
                            )

                          // Otherwise, load the route
                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            isFetching: 'loader',
                            componentsPromise,
                          }))

                          // Lazy option can modify the route options,
                          // so we need to wait for it to resolve before
                          // we can use the options
                          await route._lazyPromise

                          // Kick off the loader!
                          let loaderData =
                            await route.options.loader?.(getLoaderContext())

                          if (this.serializeLoaderData) {
                            loaderData = this.serializeLoaderData(loaderData, {
                              router: this,
                              match: this.getMatch(matchId)!,
                            })
                          }

                          handleRedirectAndNotFound(
                            this.getMatch(matchId)!,
                            loaderData,
                          )

                          await potentialPendingMinPromise()

                          const meta = route.options.meta?.({
                            matches,
                            match: this.getMatch(matchId)!,
                            params: this.getMatch(matchId)!.params,
                            loaderData,
                          })

                          const headers = route.options.headers?.({
                            loaderData,
                          })

                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            error: undefined,
                            status: 'success',
                            isFetching: false,
                            updatedAt: Date.now(),
                            loaderData,
                            meta,
                            headers,
                          }))
                        } catch (e) {
                          let error = e

                          await potentialPendingMinPromise()

                          handleRedirectAndNotFound(this.getMatch(matchId)!, e)

                          try {
                            route.options.onError?.(e)
                          } catch (onErrorError) {
                            error = onErrorError
                            handleRedirectAndNotFound(
                              this.getMatch(matchId)!,
                              onErrorError,
                            )
                          }

                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            error,
                            status: 'error',
                            isFetching: false,
                          }))
                        }

                        // Last but not least, wait for the the component
                        // to be preloaded before we resolve the match
                        await this.getMatch(matchId)!.componentsPromise
                      } catch (err) {
                        handleRedirectAndNotFound(this.getMatch(matchId)!, err)
                      }
                    }

                    // If the route is successful and still fresh, just resolve
                    const { status, invalid } = this.getMatch(matchId)!

                    if (
                      status === 'success' &&
                      (invalid || (shouldReload ?? age > staleAge))
                    ) {
                      ;(async () => {
                        try {
                          await runLoader()
                        } catch (err) {}
                      })()
                    } else if (status !== 'success') {
                      await runLoader()
                    }

                    const { loaderPromise, loadPromise } =
                      this.getMatch(matchId)!

                    loaderPromise?.resolve()
                    loadPromise?.resolve()
                  }

                  updateMatch(matchId, (prev) => ({
                    ...prev,
                    isFetching: false,
                    loaderPromise: undefined,
                  }))
                })(),
              )
            })

            await Promise.all(matchPromises)

            resolveAll()
          } catch (err) {
            rejectAll(err)
          }
        })()
      })
      await triggerOnReady()
    } catch (err) {
      if (isRedirect(err) || isNotFound(err)) {
        if (isNotFound(err) && !preload) {
          await triggerOnReady()
        }
        throw err
      }
    }

    return matches
  }

  invalidate = () => {
    const invalidate = (d: MakeRouteMatch<TRouteTree>) => ({
      ...d,
      invalid: true,
      ...(d.status === 'error'
        ? ({ status: 'pending', error: undefined } as const)
        : {}),
    })

    this.__store.setState((s) => ({
      ...s,
      matches: s.matches.map(invalidate),
      cachedMatches: s.cachedMatches.map(invalidate),
      pendingMatches: s.pendingMatches?.map(invalidate),
    }))

    return this.load()
  }

  resolveRedirect = (err: AnyRedirect): ResolvedRedirect => {
    const redirect = err as ResolvedRedirect

    if (!redirect.href) {
      redirect.href = this.buildLocation(redirect as any).href
    }

    return redirect
  }

  cleanCache = () => {
    // This is where all of the garbage collection magic happens
    this.__store.setState((s) => {
      return {
        ...s,
        cachedMatches: s.cachedMatches.filter((d) => {
          const route = this.looseRoutesById[d.routeId]!

          if (!route.options.loader) {
            return false
          }

          // If the route was preloaded, use the preloadGcTime
          // otherwise, use the gcTime
          const gcTime =
            (d.preload
              ? (route.options.preloadGcTime ??
                this.options.defaultPreloadGcTime)
              : (route.options.gcTime ?? this.options.defaultGcTime)) ??
            5 * 60 * 1000

          return d.status !== 'error' && Date.now() - d.updatedAt < gcTime
        }),
      }
    })
  }

  preloadRoute = async <
    TFrom extends RoutePaths<TRouteTree> | string = string,
    TTo extends string = '',
    TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
    TMaskTo extends string = '',
  >(
    opts: NavigateOptions<
      Router<TRouteTree, TTrailingSlashOption, TDehydrated, TSerializedError>,
      TFrom,
      TTo,
      TMaskFrom,
      TMaskTo
    >,
  ): Promise<Array<AnyRouteMatch> | undefined> => {
    const next = this.buildLocation(opts as any)

    let matches = this.matchRoutes(next.pathname, next.search, {
      throwOnError: true,
      preload: true,
    })

    const loadedMatchIds = Object.fromEntries(
      [
        ...this.state.matches,
        ...(this.state.pendingMatches ?? []),
        ...this.state.cachedMatches,
      ].map((d) => [d.id, true]),
    )

    this.__store.batch(() => {
      matches.forEach((match) => {
        if (!loadedMatchIds[match.id]) {
          this.__store.setState((s) => ({
            ...s,
            cachedMatches: [...(s.cachedMatches as any), match],
          }))
        }
      })
    })

    const activeMatchIds = new Set(
      [...this.state.matches, ...(this.state.pendingMatches ?? [])].map(
        (d) => d.id,
      ),
    )

    try {
      matches = await this.loadMatches({
        matches,
        location: next,
        preload: true,
        updateMatch: (id, updater) => {
          if (activeMatchIds.has(id)) {
            matches = matches.map((d) => (d.id === id ? updater(d) : d))
          } else {
            this.updateMatch(id, updater)
          }
        },
      })

      return matches
    } catch (err) {
      if (isRedirect(err)) {
        return await this.preloadRoute({
          ...(err as any),
          _fromLocation: next,
        })
      }
      // Preload errors are not fatal, but we should still log them
      console.error(err)
      return undefined
    }
  }

  matchRoute = <
    TFrom extends RoutePaths<TRouteTree> = '/',
    TTo extends string = '',
    TResolved = ResolveRelativePath<TFrom, NoInfer<TTo>>,
  >(
    location: ToOptions<
      Router<TRouteTree, TTrailingSlashOption, TDehydrated, TSerializedError>,
      TFrom,
      TTo
    >,
    opts?: MatchRouteOptions,
  ): false | RouteById<TRouteTree, TResolved>['types']['allParams'] => {
    const matchLocation = {
      ...location,
      to: location.to
        ? this.resolvePathWithBase((location.from || '') as string, location.to)
        : undefined,
      params: location.params || {},
      leaveParams: true,
    }
    const next = this.buildLocation(matchLocation as any)

    if (opts?.pending && this.state.status !== 'pending') {
      return false
    }

    const pending =
      opts?.pending === undefined ? !this.state.isLoading : opts.pending

    const baseLocation = pending
      ? this.latestLocation
      : this.state.resolvedLocation

    const match = matchPathname(this.basepath, baseLocation.pathname, {
      ...opts,
      to: next.pathname,
    }) as any

    if (!match) {
      return false
    }
    if (location.params) {
      if (!deepEqual(match, location.params, true)) {
        return false
      }
    }

    if (match && (opts?.includeSearch ?? true)) {
      return deepEqual(baseLocation.search, next.search, true) ? match : false
    }

    return match
  }

  dehydrate = (): DehydratedRouter => {
    const pickError =
      this.options.errorSerializer?.serialize ?? defaultSerializeError

    return {
      state: {
        dehydratedMatches: this.state.matches.map((d) => {
          return {
            ...pick(d, ['id', 'status', 'updatedAt']),
            // If an error occurs server-side during SSRing,
            // send a small subset of the error to the client
            error: d.error
              ? {
                  data: pickError(d.error),
                  __isServerError: true,
                }
              : undefined,
            // NOTE: We don't send the loader data here, because
            // there is a potential that it needs to be streamed.
            // Instead, we render it next to the route match in the HTML
            // which gives us the potential to stream it via suspense.
          }
        }),
      },
      manifest: this.manifest,
    }
  }

  hydrate = () => {
    // Client hydrates from window
    let ctx: HydrationCtx | undefined

    if (typeof document !== 'undefined') {
      ctx = this.options.transformer.parse(window.__TSR__?.dehydrated) as any
    }

    invariant(
      ctx,
      'Expected to find a dehydrated data on window.__TSR__.dehydrated... but we did not. Please file an issue!',
    )

    this.dehydratedData = ctx.payload as any
    this.options.hydrate?.(ctx.payload as any)
    const dehydratedState = ctx.router.state

    const matches = this.matchRoutes(
      this.state.location.pathname,
      this.state.location.search,
    ).map((match) => {
      const dehydratedMatch = dehydratedState.dehydratedMatches.find(
        (d) => d.id === match.id,
      )

      invariant(
        dehydratedMatch,
        `Could not find a client-side match for dehydrated match with id: ${match.id}!`,
      )

      return {
        ...match,
        ...dehydratedMatch,
      }
    })

    this.__store.setState((s) => {
      return {
        ...s,
        matches: matches as any,
      }
    })

    this.manifest = ctx.router.manifest
  }

  injectedHtml: Array<() => string> = []
  injectHtml: (html: string) => void = (html) => {
    const cb = () => {
      this.injectedHtml = this.injectedHtml.filter((d) => d !== cb)
      return html
    }

    this.injectedHtml.push(cb)
  }
  streamedKeys: Set<string> = new Set()

  getStreamedValue = <T>(key: string): T | undefined => {
    if (this.isServer) {
      return undefined
    }

    const streamedValue = window.__TSR__?.streamedValues[key]

    if (!streamedValue) {
      return
    }

    if (!streamedValue.parsed) {
      streamedValue.parsed = this.options.transformer.parse(streamedValue.value)
    }

    return streamedValue.parsed
  }

  streamValue = (key: string, value: any) => {
    warning(
      !this.streamedKeys.has(key),
      'Key has already been streamed: ' + key,
    )

    this.streamedKeys.add(key)
    const children = `__TSR__.streamedValues['${key}'] = { value: ${this.serializer?.(this.options.transformer.stringify(value))}}`

    this.injectHtml(
      `<script class='tsr-once'>${children}${
        process.env.NODE_ENV === 'development'
          ? `; console.info(\`Injected From Server:
        ${children}\`)`
          : ''
      }; __TSR__.cleanScripts()</script>`,
    )
  }

  _handleNotFound = (
    matches: Array<AnyRouteMatch>,
    err: NotFoundError,
    {
      updateMatch = this.updateMatch,
    }: {
      updateMatch?: (
        id: string,
        updater: (match: AnyRouteMatch) => AnyRouteMatch,
      ) => void
    } = {},
  ) => {
    const matchesByRouteId = Object.fromEntries(
      matches.map((match) => [match.routeId, match]),
    ) as Record<string, AnyRouteMatch>

    // Start at the route that errored or default to the root route
    let routeCursor =
      (err.global
        ? this.looseRoutesById[rootRouteId]
        : this.looseRoutesById[err.routeId]) ||
      this.looseRoutesById[rootRouteId]!

    // Go up the tree until we find a route with a notFoundComponent or we hit the root
    while (
      !routeCursor.options.notFoundComponent &&
      !this.options.defaultNotFoundComponent &&
      routeCursor.id !== rootRouteId
    ) {
      routeCursor = routeCursor.parentRoute

      invariant(
        routeCursor,
        'Found invalid route tree while trying to find not-found handler.',
      )
    }

    const match = matchesByRouteId[routeCursor.id]

    invariant(match, 'Could not find match for route: ' + routeCursor.id)

    // Assign the error to the match

    updateMatch(match.id, (prev) => ({
      ...prev,
      status: 'notFound',
      error: err,
      isFetching: false,
    }))

    if ((err as any).routerCode === 'BEFORE_LOAD' && routeCursor.parentRoute) {
      err.routeId = routeCursor.parentRoute.id
      this._handleNotFound(matches, err, {
        updateMatch,
      })
    }
  }

  hasNotFoundMatch = () => {
    return this.__store.state.matches.some(
      (d) => d.status === 'notFound' || d.globalNotFound,
    )
  }
}

// A function that takes an import() argument which is a function and returns a new function that will
// proxy arguments from the caller to the imported function, retaining all type
// information along the way
export function lazyFn<
  T extends Record<string, (...args: Array<any>) => any>,
  TKey extends keyof T = 'default',
>(fn: () => Promise<T>, key?: TKey) {
  return async (
    ...args: Parameters<T[TKey]>
  ): Promise<Awaited<ReturnType<T[TKey]>>> => {
    const imported = await fn()
    return imported[key || 'default'](...args)
  }
}

export class SearchParamError extends Error {}

export class PathParamError extends Error {}

export function getInitialRouterState(
  location: ParsedLocation,
): RouterState<any> {
  return {
    loadedAt: 0,
    isLoading: false,
    isTransitioning: false,
    status: 'idle',
    resolvedLocation: { ...location },
    location,
    matches: [],
    pendingMatches: [],
    cachedMatches: [],
    statusCode: 200,
  }
}

export function defaultSerializeError(err: unknown) {
  if (err instanceof Error) {
    const obj = {
      name: err.name,
      message: err.message,
    }

    if (process.env.NODE_ENV === 'development') {
      ;(obj as any).stack = err.stack
    }

    return obj
  }

  return {
    data: err,
  }
}
