import { Store, batch } from '@tanstack/store'
import {
  createBrowserHistory,
  createMemoryHistory,
  parseHref,
} from '@tanstack/history'
import {
  createControlledPromise,
  deepEqual,
  findLast,
  functionalUpdate,
  last,
  replaceEqualDeep,
} from './utils'
import { processRouteTree } from './process-route-tree'
import {
  cleanPath,
  interpolatePath,
  joinPaths,
  matchPathname,
  resolvePath,
  trimPath,
  trimPathRight,
} from './path'
import { isNotFound } from './not-found'
import { setupScrollRestoration } from './scroll-restoration'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import { rootRouteId } from './root'
import { isRedirect, redirect } from './redirect'
import { createLRUCache } from './lru-cache'
import { loadMatches, loadRouteChunk, routeNeedsPreload } from './load-matches'
import type { ParsePathnameCache } from './path'
import type { SearchParser, SearchSerializer } from './searchParams'
import type { AnyRedirect, ResolvedRedirect } from './redirect'
import type {
  HistoryLocation,
  HistoryState,
  ParsedHistoryState,
  RouterHistory,
} from '@tanstack/history'
import type {
  Awaitable,
  ControlledPromise,
  NoInfer,
  NonNullableUpdater,
  PickAsRequired,
  Updater,
} from './utils'
import type { ParsedLocation } from './location'
import type {
  AnyContext,
  AnyRoute,
  AnyRouteWithContext,
  MakeRemountDepsOptionsUnion,
  RouteContextOptions,
  RouteLike,
  RouteMask,
  SearchMiddleware,
} from './route'
import type {
  FullSearchSchema,
  RouteById,
  RoutePaths,
  RoutesById,
  RoutesByPath,
} from './routeInfo'
import type {
  AnyRouteMatch,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  MatchRouteOptions,
} from './Matches'
import type {
  BuildLocationFn,
  CommitLocationOptions,
  NavigateFn,
} from './RouterProvider'
import type { Manifest } from './manifest'
import type { AnySchema, AnyValidator } from './validators'
import type { NavigateOptions, ResolveRelativePath, ToOptions } from './link'
import type { NotFoundError } from './not-found'

export type ControllablePromise<T = any> = Promise<T> & {
  resolve: (value: T) => void
  reject: (value?: any) => void
}

export type InjectedHtmlEntry = Promise<string>

export interface DefaultRegister {
  router: AnyRouter
}

export interface Register extends DefaultRegister {
  // router: Router
}

export type RegisteredRouter = Register['router']

export type DefaultRemountDepsFn<TRouteTree extends AnyRoute> = (
  opts: MakeRemountDepsOptionsUnion<TRouteTree>,
) => any

export interface DefaultRouterOptionsExtensions {}

export interface RouterOptionsExtensions
  extends DefaultRouterOptionsExtensions {}

export interface RouterOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
> extends RouterOptionsExtensions {
  /**
   * The history object that will be used to manage the browser history.
   *
   * If not provided, a new createBrowserHistory instance will be created and used.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#history-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/history-types)
   */
  history?: TRouterHistory
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
  defaultPreload?: false | 'intent' | 'viewport' | 'render'
  /**
   * The delay in milliseconds that a route must be hovered over or touched before it is preloaded.
   *
   * @default 50
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloaddelay-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading#preload-delay)
   */
  defaultPreloadDelay?: number
  /**
   * The default `preloadIntentProximity` a route should use if no preloadIntentProximity is provided.
   *
   * @default 0
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloadintentproximity-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading#preload-intent-proximity)
   */
  defaultPreloadIntentProximity?: number
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
   * If `true`, route navigations will called using `document.startViewTransition()`.
   *
   * If the browser does not support this api, this option will be ignored.
   *
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) for more information on how this function works.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultviewtransition-property)
   */
  defaultViewTransition?: boolean | ViewTransitionOptions
  /**
   * The default `hashScrollIntoView` a route should use if no hashScrollIntoView is provided while navigating
   *
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView) for more information on `ScrollIntoViewOptions`.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaulthashscrollintoview-property)
   */
  defaultHashScrollIntoView?: boolean | ScrollIntoViewOptions
  /**
   * @default 'fuzzy'
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#notfoundmode-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors#the-notfoundmode-option)
   */
  notFoundMode?: 'root' | 'fuzzy'
  /**
   * The default `gcTime` a route should use if no gcTime is provided.
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
   */
  caseSensitive?: boolean
  /**
   *
   * The route tree that will be used to configure the router instance.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#routetree-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/routing/route-trees)
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
  dehydrate?: () => Awaitable<TDehydrated>
  /**
   * A function that will be called when the router is hydrated.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#hydrate-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading#critical-dehydrationhydration)
   */
  hydrate?: (dehydrated: TDehydrated) => Awaitable<void>
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
   * Use `notFoundComponent` instead.
   *
   * @deprecated
   * See https://tanstack.com/router/v1/docs/guide/not-found-errors#migrating-from-notfoundroute for more info.
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#notfoundroute-property)
   */
  notFoundRoute?: AnyRoute
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
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#isserver-property)
   */
  isServer?: boolean

  /**
   * @default false
   */
  isShell?: boolean

  /**
   * @default false
   */
  isPrerendering?: boolean

  /**
   * The default `ssr` a route should use if no `ssr` is provided.
   *
   * @default true
   */
  defaultSsr?: boolean | 'data-only'

  search?: {
    /**
     * Configures how unknown search params (= not returned by any `validateSearch`) are treated.
     *
     * @default false
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#search.strict-property)
     */
    strict?: boolean
  }

  /**
   * Configures whether structural sharing is enabled by default for fine-grained selectors.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultstructuralsharing-property)
   */
  defaultStructuralSharing?: TDefaultStructuralSharingOption

  /**
   * Configures which URI characters are allowed in path params that would ordinarily be escaped by encodeURIComponent.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#pathparamsallowedcharacters-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/path-params#allowed-characters)
   */
  pathParamsAllowedCharacters?: Array<
    ';' | ':' | '@' | '&' | '=' | '+' | '$' | ','
  >

  defaultRemountDeps?: DefaultRemountDepsFn<TRouteTree>

  /**
   * If `true`, scroll restoration will be enabled
   *
   * @default false
   */
  scrollRestoration?: boolean

  /**
   * A function that will be called to get the key for the scroll restoration cache.
   *
   * @default (location) => location.href
   */
  getScrollRestorationKey?: (location: ParsedLocation) => string
  /**
   * The default behavior for scroll restoration.
   *
   * @default 'auto'
   */
  scrollRestorationBehavior?: ScrollBehavior
  /**
   * An array of selectors that will be used to scroll to the top of the page in addition to `window`
   *
   * @default ['window']
   */
  scrollToTopSelectors?: Array<string | (() => Element | null | undefined)>

  /**
   * When `true`, disables the global catch boundary that normally wraps all route matches.
   * This allows unhandled errors to bubble up to top-level error handlers in the browser.
   *
   * Useful for testing tools (like Storybook Test Runner), error reporting services,
   * and debugging scenarios where you want errors to reach the browser's global error handlers.
   *
   * @default false
   */
  disableGlobalCatchBoundary?: boolean
}

export interface RouterState<
  in out TRouteTree extends AnyRoute = AnyRoute,
  in out TRouteMatch = MakeRouteMatchUnion,
> {
  status: 'pending' | 'idle'
  loadedAt: number
  isLoading: boolean
  isTransitioning: boolean
  matches: Array<TRouteMatch>
  pendingMatches?: Array<TRouteMatch>
  cachedMatches: Array<TRouteMatch>
  location: ParsedLocation<FullSearchSchema<TRouteTree>>
  resolvedLocation?: ParsedLocation<FullSearchSchema<TRouteTree>>
  statusCode: number
  redirect?: AnyRedirect
}

export interface BuildNextOptions {
  to?: string | number | null
  params?: true | Updater<unknown>
  search?: true | Updater<unknown>
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<ParsedHistoryState, HistoryState>
  mask?: {
    to?: string | number | null
    params?: true | Updater<unknown>
    search?: true | Updater<unknown>
    hash?: true | Updater<string>
    state?: true | NonNullableUpdater<ParsedHistoryState, HistoryState>
    unmaskOnReload?: boolean
  }
  from?: string
  href?: string
  _fromLocation?: ParsedLocation
  unsafeRelative?: 'path'
  _isNavigate?: boolean
}

type NavigationEventInfo = {
  fromLocation?: ParsedLocation
  toLocation: ParsedLocation
  pathChanged: boolean
  hrefChanged: boolean
  hashChanged: boolean
}

export interface RouterEvents {
  onBeforeNavigate: {
    type: 'onBeforeNavigate'
  } & NavigationEventInfo
  onBeforeLoad: {
    type: 'onBeforeLoad'
  } & NavigationEventInfo
  onLoad: {
    type: 'onLoad'
  } & NavigationEventInfo
  onResolved: {
    type: 'onResolved'
  } & NavigationEventInfo
  onBeforeRouteMount: {
    type: 'onBeforeRouteMount'
  } & NavigationEventInfo
  onRendered: {
    type: 'onRendered'
  } & NavigationEventInfo
}

export type RouterEvent = RouterEvents[keyof RouterEvents]

export type ListenerFn<TEvent extends RouterEvent> = (event: TEvent) => void

export type RouterListener<TRouterEvent extends RouterEvent> = {
  eventType: TRouterEvent['type']
  fn: ListenerFn<TRouterEvent>
}

export type SubscribeFn = <TType extends keyof RouterEvents>(
  eventType: TType,
  fn: ListenerFn<RouterEvents[TType]>,
) => () => void

export interface MatchRoutesOpts {
  preload?: boolean
  throwOnError?: boolean
  _buildLocation?: boolean
  dest?: BuildNextOptions
}

export type InferRouterContext<TRouteTree extends AnyRoute> =
  TRouteTree['types']['routerContext']

export type RouterContextOptions<TRouteTree extends AnyRoute> =
  AnyContext extends InferRouterContext<TRouteTree>
    ? {
        context?: InferRouterContext<TRouteTree>
      }
    : {
        context: InferRouterContext<TRouteTree>
      }

export type RouterConstructorOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRouterHistory extends RouterHistory,
  TDehydrated extends Record<string, any>,
> = Omit<
  RouterOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
  'context'
> &
  RouterContextOptions<TRouteTree>

export type PreloadRouteFn<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRouterHistory extends RouterHistory,
> = <
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: NavigateOptions<
    RouterCore<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory
    >,
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  >,
) => Promise<Array<AnyRouteMatch> | undefined>

export type MatchRouteFn<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRouterHistory extends RouterHistory,
> = <
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string | undefined = undefined,
  TResolved = ResolveRelativePath<TFrom, NoInfer<TTo>>,
>(
  location: ToOptions<
    RouterCore<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory
    >,
    TFrom,
    TTo
  >,
  opts?: MatchRouteOptions,
) => false | RouteById<TRouteTree, TResolved>['types']['allParams']

export type UpdateFn<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRouterHistory extends RouterHistory,
  TDehydrated extends Record<string, any>,
> = (
  newOptions: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
) => void

export type InvalidateFn<TRouter extends AnyRouter> = (opts?: {
  filter?: (d: MakeRouteMatchUnion<TRouter>) => boolean
  sync?: boolean
  forcePending?: boolean
}) => Promise<void>

export type ParseLocationFn<TRouteTree extends AnyRoute> = (
  locationToParse: HistoryLocation,
  previousLocation?: ParsedLocation<FullSearchSchema<TRouteTree>>,
) => ParsedLocation<FullSearchSchema<TRouteTree>>

export type GetMatchRoutesFn = (
  pathname: string,
  routePathname: string | undefined,
) => {
  matchedRoutes: Array<AnyRoute>
  routeParams: Record<string, string>
  foundRoute: AnyRoute | undefined
}

export type EmitFn = (routerEvent: RouterEvent) => void

export type LoadFn = (opts?: { sync?: boolean }) => Promise<void>

export type CommitLocationFn = ({
  viewTransition,
  ignoreBlocker,
  ...next
}: ParsedLocation & CommitLocationOptions) => Promise<void>

export type StartTransitionFn = (fn: () => void) => void

export interface MatchRoutesFn {
  (
    pathname: string,
    locationSearch?: AnySchema,
    opts?: MatchRoutesOpts,
  ): Array<MakeRouteMatchUnion>
  /**
   * @deprecated use the following signature instead
   */
  (next: ParsedLocation, opts?: MatchRoutesOpts): Array<AnyRouteMatch>
  (
    pathnameOrNext: string | ParsedLocation,
    locationSearchOrOpts?: AnySchema | MatchRoutesOpts,
    opts?: MatchRoutesOpts,
  ): Array<AnyRouteMatch>
}

export type GetMatchFn = (matchId: string) => AnyRouteMatch | undefined

export type UpdateMatchFn = (
  id: string,
  updater: (match: AnyRouteMatch) => AnyRouteMatch,
) => void

export type LoadRouteChunkFn = (route: AnyRoute) => Promise<Array<void>>

export type ResolveRedirect = (err: AnyRedirect) => ResolvedRedirect

export type ClearCacheFn<TRouter extends AnyRouter> = (opts?: {
  filter?: (d: MakeRouteMatchUnion<TRouter>) => boolean
}) => void

export interface ServerSsr {
  injectedHtml: Array<InjectedHtmlEntry>
  injectHtml: (getHtml: () => string | Promise<string>) => Promise<void>
  injectScript: (
    getScript: () => string | Promise<string>,
    opts?: { logScript?: boolean },
  ) => Promise<void>
  isDehydrated: () => boolean
  onRenderFinished: (listener: () => void) => void
  dehydrate: () => Promise<void>
}

export type AnyRouterWithContext<TContext> = RouterCore<
  AnyRouteWithContext<TContext>,
  any,
  any,
  any,
  any
>

export type AnyRouter = RouterCore<any, any, any, any, any>

export interface ViewTransitionOptions {
  types:
    | Array<string>
    | ((locationChangeInfo: {
        fromLocation?: ParsedLocation
        toLocation: ParsedLocation
        pathChanged: boolean
        hrefChanged: boolean
        hashChanged: boolean
      }) => Array<string>)
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

export type TrailingSlashOption = 'always' | 'never' | 'preserve'

export function getLocationChangeInfo(routerState: {
  resolvedLocation?: ParsedLocation
  location: ParsedLocation
}) {
  const fromLocation = routerState.resolvedLocation
  const toLocation = routerState.location
  const pathChanged = fromLocation?.pathname !== toLocation.pathname
  const hrefChanged = fromLocation?.href !== toLocation.href
  const hashChanged = fromLocation?.hash !== toLocation.hash
  return { fromLocation, toLocation, pathChanged, hrefChanged, hashChanged }
}

export type CreateRouterFn = <
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: undefined extends number
    ? 'strictNullChecks must be enabled in tsconfig.json'
    : RouterConstructorOptions<
        TRouteTree,
        TTrailingSlashOption,
        TDefaultStructuralSharingOption,
        TRouterHistory,
        TDehydrated
      >,
) => RouterCore<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
>

export class RouterCore<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
  in out TDefaultStructuralSharingOption extends boolean,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> {
  // Option-independent properties
  tempLocationKey: string | undefined = `${Math.round(
    Math.random() * 10000000,
  )}`
  resetNextScroll = true
  shouldViewTransition?: boolean | ViewTransitionOptions = undefined
  isViewTransitionTypesSupported?: boolean = undefined
  subscribers = new Set<RouterListener<RouterEvent>>()
  viewTransitionPromise?: ControlledPromise<true>
  isScrollRestoring = false
  isScrollRestorationSetup = false

  // Must build in constructor
  __store!: Store<RouterState<TRouteTree>>
  options!: PickAsRequired<
    RouterOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: TRouterHistory
  latestLocation!: ParsedLocation<FullSearchSchema<TRouteTree>>
  basepath!: string
  routeTree!: TRouteTree
  routesById!: RoutesById<TRouteTree>
  routesByPath!: RoutesByPath<TRouteTree>
  flatRoutes!: Array<AnyRoute>
  isServer!: boolean
  pathParamsDecodeCharMap?: Map<string, string>

  /**
   * @deprecated Use the `createRouter` function instead
   */
  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
  ) {
    this.update({
      defaultPreloadDelay: 50,
      defaultPendingMs: 1000,
      defaultPendingMinMs: 500,
      context: undefined!,
      ...options,
      caseSensitive: options.caseSensitive ?? false,
      notFoundMode: options.notFoundMode ?? 'fuzzy',
      stringifySearch: options.stringifySearch ?? defaultStringifySearch,
      parseSearch: options.parseSearch ?? defaultParseSearch,
    })

    if (typeof document !== 'undefined') {
      self.__TSR_ROUTER__ = this
    }
  }

  // These are default implementations that can optionally be overridden
  // by the router provider once rendered. We provide these so that the
  // router can be used in a non-react environment if necessary
  startTransition: StartTransitionFn = (fn) => fn()

  isShell() {
    return !!this.options.isShell
  }

  isPrerendering() {
    return !!this.options.isPrerendering
  }

  update: UpdateFn<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  > = (newOptions) => {
    if (newOptions.notFoundRoute) {
      console.warn(
        'The notFoundRoute API is deprecated and will be removed in the next major version. See https://tanstack.com/router/v1/docs/framework/react/guide/not-found-errors#migrating-from-notfoundroute for more info.',
      )
    }

    const previousOptions = this.options
    this.options = {
      ...this.options,
      ...newOptions,
    }

    this.isServer = this.options.isServer ?? typeof document === 'undefined'

    this.pathParamsDecodeCharMap = this.options.pathParamsAllowedCharacters
      ? new Map(
          this.options.pathParamsAllowedCharacters.map((char) => [
            encodeURIComponent(char),
            char,
          ]),
        )
      : undefined

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
      !this.history ||
      (this.options.history && this.options.history !== this.history)
    ) {
      this.history =
        this.options.history ??
        ((this.isServer
          ? createMemoryHistory({
              initialEntries: [this.basepath || '/'],
            })
          : createBrowserHistory()) as TRouterHistory)
      this.updateLatestLocation()
    }

    if (this.options.routeTree !== this.routeTree) {
      this.routeTree = this.options.routeTree as TRouteTree
      this.buildRouteTree()
    }

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

      setupScrollRestoration(this)
    }

    if (
      typeof window !== 'undefined' &&
      'CSS' in window &&
      typeof window.CSS?.supports === 'function'
    ) {
      this.isViewTransitionTypesSupported = window.CSS.supports(
        'selector(:active-view-transition-type(a)',
      )
    }
  }

  get state() {
    return this.__store.state
  }

  updateLatestLocation = () => {
    this.latestLocation = this.parseLocation(
      this.history.location,
      this.latestLocation,
    )
  }

  buildRouteTree = () => {
    const { routesById, routesByPath, flatRoutes } = processRouteTree({
      routeTree: this.routeTree,
      initRoute: (route, i) => {
        route.init({
          originalIndex: i,
        })
      },
    })

    this.routesById = routesById as RoutesById<TRouteTree>
    this.routesByPath = routesByPath as RoutesByPath<TRouteTree>
    this.flatRoutes = flatRoutes as Array<AnyRoute>

    const notFoundRoute = this.options.notFoundRoute

    if (notFoundRoute) {
      notFoundRoute.init({
        originalIndex: 99999999999,
      })
      this.routesById[notFoundRoute.id] = notFoundRoute
    }
  }

  subscribe: SubscribeFn = (eventType, fn) => {
    const listener: RouterListener<any> = {
      eventType,
      fn,
    }

    this.subscribers.add(listener)

    return () => {
      this.subscribers.delete(listener)
    }
  }

  emit: EmitFn = (routerEvent) => {
    this.subscribers.forEach((listener) => {
      if (listener.eventType === routerEvent.type) {
        listener.fn(routerEvent)
      }
    })
  }

  parseLocation: ParseLocationFn<TRouteTree> = (
    locationToParse,
    previousLocation,
  ) => {
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

    const location = parse(locationToParse)

    const { __tempLocation, __tempKey } = location.state

    if (__tempLocation && (!__tempKey || __tempKey === this.tempLocationKey)) {
      // Sync up the location keys
      const parsedTempLocation = parse(__tempLocation) as any
      parsedTempLocation.state.key = location.state.key // TODO: Remove in v2 - use __TSR_key instead
      parsedTempLocation.state.__TSR_key = location.state.__TSR_key

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
      caseSensitive: this.options.caseSensitive,
      parseCache: this.parsePathnameCache,
    })
    return resolvedPath
  }

  get looseRoutesById() {
    return this.routesById as Record<string, AnyRoute>
  }

  matchRoutes: MatchRoutesFn = (
    pathnameOrNext: string | ParsedLocation,
    locationSearchOrOpts?: AnySchema | MatchRoutesOpts,
    opts?: MatchRoutesOpts,
  ) => {
    if (typeof pathnameOrNext === 'string') {
      return this.matchRoutesInternal(
        {
          pathname: pathnameOrNext,
          search: locationSearchOrOpts,
        } as ParsedLocation,
        opts,
      )
    }

    return this.matchRoutesInternal(pathnameOrNext, locationSearchOrOpts)
  }

  private matchRoutesInternal(
    next: ParsedLocation,
    opts?: MatchRoutesOpts,
  ): Array<AnyRouteMatch> {
    const { foundRoute, matchedRoutes, routeParams } = this.getMatchedRoutes(
      next.pathname,
      opts?.dest?.to as string,
    )
    let isGlobalNotFound = false

    // Check to see if the route needs a 404 entry
    if (
      // If we found a route, and it's not an index route and we have left over path
      foundRoute
        ? foundRoute.path !== '/' && routeParams['**']
        : // Or if we didn't find a route and we have left over path
          trimPathRight(next.pathname)
    ) {
      // If the user has defined an (old) 404 route, use it
      if (this.options.notFoundRoute) {
        matchedRoutes.push(this.options.notFoundRoute)
      } else {
        // If there is no routes found during path matching
        isGlobalNotFound = true
      }
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

    const matches: Array<AnyRouteMatch> = []

    const getParentContext = (parentMatch?: AnyRouteMatch) => {
      const parentMatchId = parentMatch?.id

      const parentContext = !parentMatchId
        ? ((this.options.context as any) ?? undefined)
        : (parentMatch.context ?? this.options.context ?? undefined)

      return parentContext
    }

    matchedRoutes.forEach((route, index) => {
      // Take each matched route and resolve + validate its search params
      // This has to happen serially because each route's search params
      // can depend on the parent route's search params
      // It must also happen before we create the match so that we can
      // pass the search params to the route's potential key function
      // which is used to uniquely identify the route match in state

      const parentMatch = matches[index - 1]

      const [preMatchSearch, strictMatchSearch, searchError]: [
        Record<string, any>,
        Record<string, any>,
        any,
      ] = (() => {
        // Validate the search params and stabilize them
        const parentSearch = parentMatch?.search ?? next.search
        const parentStrictSearch = parentMatch?._strictSearch ?? undefined

        try {
          const strictSearch =
            validateSearch(route.options.validateSearch, { ...parentSearch }) ??
            undefined

          return [
            {
              ...parentSearch,
              ...strictSearch,
            },
            { ...parentStrictSearch, ...strictSearch },
            undefined,
          ]
        } catch (err: any) {
          let searchParamError = err
          if (!(err instanceof SearchParamError)) {
            searchParamError = new SearchParamError(err.message, {
              cause: err,
            })
          }

          if (opts?.throwOnError) {
            throw searchParamError
          }

          return [parentSearch, {}, searchParamError]
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

      const { interpolatedPath, usedParams } = interpolatePath({
        path: route.fullPath,
        params: routeParams,
        decodeCharMap: this.pathParamsDecodeCharMap,
      })

      // Waste not, want not. If we already have a match for this route,
      // reuse it. This is important for layout routes, which might stick
      // around between navigation actions that only change leaf routes.

      // Existing matches are matches that are already loaded along with
      // pending matches that are still loading
      const matchId =
        interpolatePath({
          path: route.id,
          params: routeParams,
          leaveWildcards: true,
          decodeCharMap: this.pathParamsDecodeCharMap,
          parseCache: this.parsePathnameCache,
        }).interpolatedPath + loaderDepsHash

      const existingMatch = this.getMatch(matchId)

      const previousMatch = this.state.matches.find(
        (d) => d.routeId === route.id,
      )

      const strictParams = existingMatch?._strictParams ?? usedParams

      let paramsError: PathParamError | undefined = undefined

      if (!existingMatch) {
        const strictParseParams =
          route.options.params?.parse ?? route.options.parseParams

        if (strictParseParams) {
          try {
            Object.assign(
              strictParams,
              strictParseParams(strictParams as Record<string, string>),
            )
          } catch (err: any) {
            paramsError = new PathParamError(err.message, {
              cause: err,
            })

            if (opts?.throwOnError) {
              throw paramsError
            }
          }
        }
      }

      Object.assign(routeParams, strictParams)

      const cause = previousMatch ? 'stay' : 'enter'

      let match: AnyRouteMatch

      if (existingMatch) {
        match = {
          ...existingMatch,
          cause,
          params: previousMatch
            ? replaceEqualDeep(previousMatch.params, routeParams)
            : routeParams,
          _strictParams: strictParams,
          search: previousMatch
            ? replaceEqualDeep(previousMatch.search, preMatchSearch)
            : replaceEqualDeep(existingMatch.search, preMatchSearch),
          _strictSearch: strictMatchSearch,
        }
      } else {
        const status =
          route.options.loader ||
          route.options.beforeLoad ||
          route.lazyFn ||
          routeNeedsPreload(route)
            ? 'pending'
            : 'success'

        match = {
          id: matchId,
          index,
          routeId: route.id,
          params: previousMatch
            ? replaceEqualDeep(previousMatch.params, routeParams)
            : routeParams,
          _strictParams: strictParams,
          pathname: joinPaths([this.basepath, interpolatedPath]),
          updatedAt: Date.now(),
          search: previousMatch
            ? replaceEqualDeep(previousMatch.search, preMatchSearch)
            : preMatchSearch,
          _strictSearch: strictMatchSearch,
          searchError: undefined,
          status,
          isFetching: false,
          error: undefined,
          paramsError,
          __routeContext: undefined,
          _nonReactive: {
            loadPromise: createControlledPromise(),
          },
          __beforeLoadContext: undefined,
          context: {},
          abortController: new AbortController(),
          fetchCount: 0,
          cause,
          loaderDeps: previousMatch
            ? replaceEqualDeep(previousMatch.loaderDeps, loaderDeps)
            : loaderDeps,
          invalid: false,
          preload: false,
          links: undefined,
          scripts: undefined,
          headScripts: undefined,
          meta: undefined,
          staticData: route.options.staticData || {},
          fullPath: route.fullPath,
        }
      }

      if (!opts?.preload) {
        // If we have a global not found, mark the right match as global not found
        match.globalNotFound = globalNotFoundRouteId === route.id
      }

      // update the searchError if there is one
      match.searchError = searchError

      const parentContext = getParentContext(parentMatch)

      match.context = {
        ...parentContext,
        ...match.__routeContext,
        ...match.__beforeLoadContext,
      }

      matches.push(match)
    })

    matches.forEach((match, index) => {
      const route = this.looseRoutesById[match.routeId]!
      const existingMatch = this.getMatch(match.id)

      // only execute `context` if we are not calling from router.buildLocation

      if (!existingMatch && opts?._buildLocation !== true) {
        const parentMatch = matches[index - 1]
        const parentContext = getParentContext(parentMatch)

        // Update the match's context

        if (route.options.context) {
          const contextFnContext: RouteContextOptions<any, any, any, any> = {
            deps: match.loaderDeps,
            params: match.params,
            context: parentContext ?? {},
            location: next,
            navigate: (opts: any) =>
              this.navigate({ ...opts, _fromLocation: next }),
            buildLocation: this.buildLocation,
            cause: match.cause,
            abortController: match.abortController,
            preload: !!match.preload,
            matches,
          }
          // Get the route context
          match.__routeContext =
            route.options.context(contextFnContext) ?? undefined
        }

        match.context = {
          ...parentContext,
          ...match.__routeContext,
          ...match.__beforeLoadContext,
        }
      }
    })

    return matches
  }

  /** a cache for `parsePathname` */
  private parsePathnameCache: ParsePathnameCache = createLRUCache(1000)

  getMatchedRoutes: GetMatchRoutesFn = (
    pathname: string,
    routePathname: string | undefined,
  ) => {
    return getMatchedRoutes({
      pathname,
      routePathname,
      basepath: this.basepath,
      caseSensitive: this.options.caseSensitive,
      routesByPath: this.routesByPath,
      routesById: this.routesById,
      flatRoutes: this.flatRoutes,
      parseCache: this.parsePathnameCache,
    })
  }

  cancelMatch = (id: string) => {
    const match = this.getMatch(id)

    if (!match) return

    match.abortController.abort()
    clearTimeout(match._nonReactive.pendingTimeout)
    match._nonReactive.pendingTimeout = undefined
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
    ): ParsedLocation => {
      // We allow the caller to override the current location
      const currentLocation = dest._fromLocation || this.latestLocation

      const allCurrentLocationMatches = this.matchRoutes(currentLocation, {
        _buildLocation: true,
      })

      // Now let's find the starting pathname
      // This should default to the current location if no from is provided
      const lastMatch = last(allCurrentLocationMatches)!

      // check that from path exists in the current route tree
      // do this check only on navigations during test or development
      if (
        dest.from &&
        process.env.NODE_ENV !== 'production' &&
        dest._isNavigate
      ) {
        const allFromMatches = this.getMatchedRoutes(
          dest.from,
          undefined,
        ).matchedRoutes

        const matchedFrom = findLast(allCurrentLocationMatches, (d) => {
          return comparePaths(d.fullPath, dest.from!)
        })

        const matchedCurrent = findLast(allFromMatches, (d) => {
          return comparePaths(d.fullPath, lastMatch.fullPath)
        })

        // for from to be invalid it shouldn't just be unmatched to currentLocation
        // but the currentLocation should also be unmatched to from
        if (!matchedFrom && !matchedCurrent) {
          console.warn(`Could not find match for from: ${dest.from}`)
        }
      }

      const defaultedFromPath =
        dest.unsafeRelative === 'path'
          ? currentLocation.pathname
          : (dest.from ?? lastMatch.fullPath)

      // ensure this includes the basePath if set
      const fromPath = this.resolvePathWithBase(defaultedFromPath, '.')

      // From search should always use the current location
      const fromSearch = lastMatch.search
      // Same with params. It can't hurt to provide as many as possible
      const fromParams = { ...lastMatch.params }

      // Resolve the next to
      // ensure this includes the basePath if set
      const nextTo = dest.to
        ? this.resolvePathWithBase(fromPath, `${dest.to}`)
        : this.resolvePathWithBase(fromPath, '.')

      // Resolve the next params
      const nextParams =
        dest.params === false || dest.params === null
          ? {}
          : (dest.params ?? true) === true
            ? fromParams
            : Object.assign(
                fromParams,
                functionalUpdate(dest.params as any, fromParams),
              )

      // Interpolate the path first to get the actual resolved path, then match against that
      const interpolatedNextTo = interpolatePath({
        path: nextTo,
        params: nextParams,
        parseCache: this.parsePathnameCache,
      }).interpolatedPath

      const destRoutes = this.matchRoutes(interpolatedNextTo, undefined, {
        _buildLocation: true,
      }).map((d) => this.looseRoutesById[d.routeId]!)

      // If there are any params, we need to stringify them
      if (Object.keys(nextParams).length > 0) {
        for (const route of destRoutes) {
          const fn =
            route.options.params?.stringify ?? route.options.stringifyParams
          if (fn) {
            Object.assign(nextParams, fn(nextParams))
          }
        }
      }

      const nextPathname = interpolatePath({
        // Use the original template path for interpolation
        // This preserves the original parameter syntax including optional parameters
        path: nextTo,
        params: nextParams,
        leaveWildcards: false,
        leaveParams: opts.leaveParams,
        decodeCharMap: this.pathParamsDecodeCharMap,
        parseCache: this.parsePathnameCache,
      }).interpolatedPath

      // Resolve the next search
      let nextSearch = fromSearch
      if (opts._includeValidateSearch && this.options.search?.strict) {
        const validatedSearch = {}
        destRoutes.forEach((route) => {
          if (route.options.validateSearch) {
            try {
              Object.assign(
                validatedSearch,
                validateSearch(route.options.validateSearch, {
                  ...validatedSearch,
                  ...nextSearch,
                }),
              )
            } catch {
              // ignore errors here because they are already handled in matchRoutes
            }
          }
        })
        nextSearch = validatedSearch
      }

      nextSearch = applySearchMiddleware({
        search: nextSearch,
        dest,
        destRoutes,
        _includeValidateSearch: opts._includeValidateSearch,
      })

      // Replace the equal deep
      nextSearch = replaceEqualDeep(fromSearch, nextSearch)

      // Stringify the next search
      const searchStr = this.options.stringifySearch(nextSearch)

      // Resolve the next hash
      const hash =
        dest.hash === true
          ? currentLocation.hash
          : dest.hash
            ? functionalUpdate(dest.hash, currentLocation.hash)
            : undefined

      // Resolve the next hash string
      const hashStr = hash ? `#${hash}` : ''

      // Resolve the next state
      let nextState =
        dest.state === true
          ? currentLocation.state
          : dest.state
            ? functionalUpdate(dest.state, currentLocation.state)
            : {}

      // Replace the equal deep
      nextState = replaceEqualDeep(currentLocation.state, nextState)

      // Return the next location
      return {
        pathname: nextPathname,
        search: nextSearch,
        searchStr,
        state: nextState as any,
        hash: hash ?? '',
        href: `${nextPathname}${searchStr}${hashStr}`,
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
          const match = matchPathname(
            this.basepath,
            next.pathname,
            {
              to: d.from,
              caseSensitive: false,
              fuzzy: false,
            },
            this.parsePathnameCache,
          )

          if (match) {
            params = match
            return true
          }

          return false
        })

        if (foundMask) {
          const { from: _from, ...maskProps } = foundMask
          maskedDest = {
            from: opts.from,
            ...maskProps,
            params,
          }
          maskedNext = build(maskedDest)
        }
      }

      if (maskedNext) {
        next.maskedLocation = maskedNext
      }

      return next
    }

    if (opts.mask) {
      return buildWithMatches(opts, {
        from: opts.from,
        ...opts.mask,
      })
    }

    return buildWithMatches(opts)
  }

  commitLocationPromise: undefined | ControlledPromise<void>

  commitLocation: CommitLocationFn = ({
    viewTransition,
    ignoreBlocker,
    ...next
  }) => {
    const isSameState = () => {
      // the following props are ignored but may still be provided when navigating,
      // temporarily add the previous values to the next state so they don't affect
      // the comparison
      const ignoredProps = [
        'key', // TODO: Remove in v2 - use __TSR_key instead
        '__TSR_key',
        '__TSR_index',
        '__hashScrollIntoViewOptions',
      ] as const
      ignoredProps.forEach((prop) => {
        ;(next.state as any)[prop] = this.latestLocation.state[prop]
      })
      const isEqual = deepEqual(next.state, this.latestLocation.state)
      ignoredProps.forEach((prop) => {
        delete next.state[prop]
      })
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
      let { maskedLocation, hashScrollIntoView, ...nextHistory } = next

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
                __TSR_key: undefined!,
                key: undefined!, // TODO: Remove in v2 - use __TSR_key instead
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

      nextHistory.state.__hashScrollIntoViewOptions =
        hashScrollIntoView ?? this.options.defaultHashScrollIntoView ?? true

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
    hashScrollIntoView,
    viewTransition,
    ignoreBlocker,
    href,
    ...rest
  }: BuildNextOptions & CommitLocationOptions = {}) => {
    if (href) {
      const currentIndex = this.history.location.state.__TSR_index

      const parsed = parseHref(href, {
        __TSR_index: replace ? currentIndex : currentIndex + 1,
      })
      rest.to = parsed.pathname
      rest.search = this.options.parseSearch(parsed.search)
      // remove the leading `#` from the hash
      rest.hash = parsed.hash.slice(1)
    }

    const location = this.buildLocation({
      ...(rest as any),
      _includeValidateSearch: true,
    })

    return this.commitLocation({
      ...location,
      viewTransition,
      replace,
      resetScroll,
      hashScrollIntoView,
      ignoreBlocker,
    })
  }

  navigate: NavigateFn = ({ to, reloadDocument, href, ...rest }) => {
    if (!reloadDocument && href) {
      try {
        new URL(`${href}`)
        reloadDocument = true
      } catch {}
    }

    if (reloadDocument) {
      if (!href) {
        const location = this.buildLocation({ to, ...rest } as any)
        href = this.history.createHref(location.href)
      }
      if (rest.replace) {
        window.location.replace(href)
      } else {
        window.location.href = href
      }
      return Promise.resolve()
    }

    return this.buildAndCommitLocation({
      ...rest,
      href,
      to: to as string,
      _isNavigate: true,
    })
  }

  latestLoadPromise: undefined | Promise<void>

  beforeLoad = () => {
    // Cancel any pending matches
    this.cancelMatches()
    this.updateLatestLocation()

    if (this.isServer) {
      // for SPAs on the initial load, this is handled by the Transitioner
      const nextLocation = this.buildLocation({
        to: this.latestLocation.pathname,
        search: true,
        params: true,
        hash: true,
        state: true,
        _includeValidateSearch: true,
      })

      // Normalize URLs for comparison to handle encoding differences
      // Browser history always stores encoded URLs while buildLocation may produce decoded URLs
      const normalizeUrl = (url: string) => {
        try {
          return encodeURI(decodeURI(url))
        } catch {
          return url
        }
      }

      if (
        trimPath(normalizeUrl(this.latestLocation.href)) !==
        trimPath(normalizeUrl(nextLocation.href))
      ) {
        throw redirect({ href: nextLocation.href })
      }
    }
    // Match the routes
    const pendingMatches = this.matchRoutes(this.latestLocation)

    // Ingest the new matches
    this.__store.setState((s) => ({
      ...s,
      status: 'pending',
      statusCode: 200,
      isLoading: true,
      location: this.latestLocation,
      pendingMatches,
      // If a cached moved to pendingMatches, remove it from cachedMatches
      cachedMatches: s.cachedMatches.filter(
        (d) => !pendingMatches.some((e) => e.id === d.id),
      ),
    }))
  }

  load: LoadFn = async (opts?: { sync?: boolean }): Promise<void> => {
    let redirect: AnyRedirect | undefined
    let notFound: NotFoundError | undefined
    let loadPromise: Promise<void>

    // eslint-disable-next-line prefer-const
    loadPromise = new Promise<void>((resolve) => {
      this.startTransition(async () => {
        try {
          this.beforeLoad()
          const next = this.latestLocation
          const prevLocation = this.state.resolvedLocation

          if (!this.state.redirect) {
            this.emit({
              type: 'onBeforeNavigate',
              ...getLocationChangeInfo({
                resolvedLocation: prevLocation,
                location: next,
              }),
            })
          }

          this.emit({
            type: 'onBeforeLoad',
            ...getLocationChangeInfo({
              resolvedLocation: prevLocation,
              location: next,
            }),
          })

          await loadMatches({
            router: this,
            sync: opts?.sync,
            matches: this.state.pendingMatches as Array<AnyRouteMatch>,
            location: next,
            updateMatch: this.updateMatch,
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

                batch(() => {
                  this.__store.setState((s) => {
                    const previousMatches = s.matches
                    const newMatches = s.pendingMatches || s.matches

                    exitingMatches = previousMatches.filter(
                      (match) => !newMatches.some((d) => d.id === match.id),
                    )
                    enteringMatches = newMatches.filter(
                      (match) =>
                        !previousMatches.some((d) => d.id === match.id),
                    )
                    stayingMatches = previousMatches.filter((match) =>
                      newMatches.some((d) => d.id === match.id),
                    )

                    return {
                      ...s,
                      isLoading: false,
                      loadedAt: Date.now(),
                      matches: newMatches,
                      pendingMatches: undefined,
                      cachedMatches: [
                        ...s.cachedMatches,
                        ...exitingMatches.filter((d) => d.status !== 'error'),
                      ],
                    }
                  })
                  this.clearExpiredCache()
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
          if (isRedirect(err)) {
            redirect = err
            if (!this.isServer) {
              this.navigate({
                ...redirect.options,
                replace: true,
                ignoreBlocker: true,
              })
            }
          } else if (isNotFound(err)) {
            notFound = err
          }

          this.__store.setState((s) => ({
            ...s,
            statusCode: redirect
              ? redirect.status
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

    if (this.hasNotFoundMatch()) {
      this.__store.setState((s) => ({
        ...s,
        statusCode: 404,
      }))
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
    if (
      shouldViewTransition &&
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      typeof document.startViewTransition === 'function'
    ) {
      // lib.dom.ts doesn't support viewTransition types variant yet.
      // TODO: Fix this when dom types are updated
      let startViewTransitionParams: any

      if (
        typeof shouldViewTransition === 'object' &&
        this.isViewTransitionTypesSupported
      ) {
        const next = this.latestLocation
        const prevLocation = this.state.resolvedLocation

        const resolvedViewTransitionTypes =
          typeof shouldViewTransition.types === 'function'
            ? shouldViewTransition.types(
                getLocationChangeInfo({
                  resolvedLocation: prevLocation,
                  location: next,
                }),
              )
            : shouldViewTransition.types

        startViewTransitionParams = {
          update: fn,
          types: resolvedViewTransitionTypes,
        }
      } else {
        startViewTransitionParams = fn
      }

      document.startViewTransition(startViewTransitionParams)
    } else {
      fn()
    }
  }

  updateMatch: UpdateMatchFn = (id, updater) => {
    const matchesKey = this.state.pendingMatches?.some((d) => d.id === id)
      ? 'pendingMatches'
      : this.state.matches.some((d) => d.id === id)
        ? 'matches'
        : this.state.cachedMatches.some((d) => d.id === id)
          ? 'cachedMatches'
          : ''

    if (matchesKey) {
      this.__store.setState((s) => ({
        ...s,
        [matchesKey]: s[matchesKey]?.map((d) => (d.id === id ? updater(d) : d)),
      }))
    }
  }

  getMatch: GetMatchFn = (matchId: string) => {
    const findFn = (d: { id: string }) => d.id === matchId
    return (
      this.state.cachedMatches.find(findFn) ??
      this.state.pendingMatches?.find(findFn) ??
      this.state.matches.find(findFn)
    )
  }

  invalidate: InvalidateFn<
    RouterCore<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >
  > = (opts) => {
    const invalidate = (d: MakeRouteMatch<TRouteTree>) => {
      if (opts?.filter?.(d as MakeRouteMatchUnion<this>) ?? true) {
        return {
          ...d,
          invalid: true,
          ...(opts?.forcePending || d.status === 'error'
            ? ({ status: 'pending', error: undefined } as const)
            : undefined),
        }
      }
      return d
    }

    this.__store.setState((s) => ({
      ...s,
      matches: s.matches.map(invalidate),
      cachedMatches: s.cachedMatches.map(invalidate),
      pendingMatches: s.pendingMatches?.map(invalidate),
    }))

    this.shouldViewTransition = false
    return this.load({ sync: opts?.sync })
  }

  resolveRedirect = (redirect: AnyRedirect): AnyRedirect => {
    if (!redirect.options.href) {
      redirect.options.href = this.buildLocation(redirect.options).href
      redirect.headers.set('Location', redirect.options.href)
    }

    if (!redirect.headers.get('Location')) {
      redirect.headers.set('Location', redirect.options.href)
    }

    return redirect
  }

  clearCache: ClearCacheFn<this> = (opts) => {
    const filter = opts?.filter
    if (filter !== undefined) {
      this.__store.setState((s) => {
        return {
          ...s,
          cachedMatches: s.cachedMatches.filter(
            (m) => !filter(m as MakeRouteMatchUnion<this>),
          ),
        }
      })
    } else {
      this.__store.setState((s) => {
        return {
          ...s,
          cachedMatches: [],
        }
      })
    }
  }

  clearExpiredCache = () => {
    // This is where all of the garbage collection magic happens
    const filter = (d: MakeRouteMatch<TRouteTree>) => {
      const route = this.looseRoutesById[d.routeId]!

      if (!route.options.loader) {
        return true
      }

      // If the route was preloaded, use the preloadGcTime
      // otherwise, use the gcTime
      const gcTime =
        (d.preload
          ? (route.options.preloadGcTime ?? this.options.defaultPreloadGcTime)
          : (route.options.gcTime ?? this.options.defaultGcTime)) ??
        5 * 60 * 1000

      const isError = d.status === 'error'
      if (isError) return true

      const gcEligible = Date.now() - d.updatedAt >= gcTime
      return gcEligible
    }
    this.clearCache({ filter })
  }

  loadRouteChunk = loadRouteChunk

  preloadRoute: PreloadRouteFn<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory
  > = async (opts) => {
    const next = this.buildLocation(opts as any)

    let matches = this.matchRoutes(next, {
      throwOnError: true,
      preload: true,
      dest: opts,
    })

    const activeMatchIds = new Set(
      [...this.state.matches, ...(this.state.pendingMatches ?? [])].map(
        (d) => d.id,
      ),
    )

    const loadedMatchIds = new Set([
      ...activeMatchIds,
      ...this.state.cachedMatches.map((d) => d.id),
    ])

    // If the matches are already loaded, we need to add them to the cachedMatches
    batch(() => {
      matches.forEach((match) => {
        if (!loadedMatchIds.has(match.id)) {
          this.__store.setState((s) => ({
            ...s,
            cachedMatches: [...(s.cachedMatches as any), match],
          }))
        }
      })
    })

    try {
      matches = await loadMatches({
        router: this,
        matches,
        location: next,
        preload: true,
        updateMatch: (id, updater) => {
          // Don't update the match if it's currently loaded
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
        if (err.options.reloadDocument) {
          return undefined
        }

        return await this.preloadRoute({
          ...err.options,
          _fromLocation: next,
        })
      }
      if (!isNotFound(err)) {
        // Preload errors are not fatal, but we should still log them
        console.error(err)
      }
      return undefined
    }
  }

  matchRoute: MatchRouteFn<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory
  > = (location, opts) => {
    const matchLocation = {
      ...location,
      to: location.to
        ? this.resolvePathWithBase(
            (location.from || '') as string,
            location.to as string,
          )
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
      : this.state.resolvedLocation || this.state.location

    const match = matchPathname(
      this.basepath,
      baseLocation.pathname,
      {
        ...opts,
        to: next.pathname,
      },
      this.parsePathnameCache,
    ) as any

    if (!match) {
      return false
    }
    if (location.params) {
      if (!deepEqual(match, location.params, { partial: true })) {
        return false
      }
    }

    if (match && (opts?.includeSearch ?? true)) {
      return deepEqual(baseLocation.search, next.search, { partial: true })
        ? match
        : false
    }

    return match
  }

  ssr?: {
    manifest: Manifest | undefined
  }

  serverSsr?: ServerSsr

  hasNotFoundMatch = () => {
    return this.__store.state.matches.some(
      (d) => d.status === 'notFound' || d.globalNotFound,
    )
  }
}

export class SearchParamError extends Error {}

export class PathParamError extends Error {}

const normalize = (str: string) =>
  str.endsWith('/') && str.length > 1 ? str.slice(0, -1) : str
function comparePaths(a: string, b: string) {
  return normalize(a) === normalize(b)
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

export function getInitialRouterState(
  location: ParsedLocation,
): RouterState<any> {
  return {
    loadedAt: 0,
    isLoading: false,
    isTransitioning: false,
    status: 'idle',
    resolvedLocation: undefined,
    location,
    matches: [],
    pendingMatches: [],
    cachedMatches: [],
    statusCode: 200,
  }
}

function validateSearch(validateSearch: AnyValidator, input: unknown): unknown {
  if (validateSearch == null) return {}

  if ('~standard' in validateSearch) {
    const result = validateSearch['~standard'].validate(input)

    if (result instanceof Promise)
      throw new SearchParamError('Async validation not supported')

    if (result.issues)
      throw new SearchParamError(JSON.stringify(result.issues, undefined, 2), {
        cause: result,
      })

    return result.value
  }

  if ('parse' in validateSearch) {
    return validateSearch.parse(input)
  }

  if (typeof validateSearch === 'function') {
    return validateSearch(input)
  }

  return {}
}

export function getMatchedRoutes<TRouteLike extends RouteLike>({
  pathname,
  routePathname,
  basepath,
  caseSensitive,
  routesByPath,
  routesById,
  flatRoutes,
  parseCache,
}: {
  pathname: string
  routePathname?: string
  basepath: string
  caseSensitive?: boolean
  routesByPath: Record<string, TRouteLike>
  routesById: Record<string, TRouteLike>
  flatRoutes: Array<TRouteLike>
  parseCache?: ParsePathnameCache
}) {
  let routeParams: Record<string, string> = {}
  const trimmedPath = trimPathRight(pathname)
  const getMatchedParams = (route: TRouteLike) => {
    const result = matchPathname(
      basepath,
      trimmedPath,
      {
        to: route.fullPath,
        caseSensitive: route.options?.caseSensitive ?? caseSensitive,
        // we need fuzzy matching for `notFoundMode: 'fuzzy'`
        fuzzy: true,
      },
      parseCache,
    )
    return result
  }

  let foundRoute: TRouteLike | undefined =
    routePathname !== undefined ? routesByPath[routePathname] : undefined
  if (foundRoute) {
    routeParams = getMatchedParams(foundRoute)!
  } else {
    // iterate over flatRoutes to find the best match
    // if we find a fuzzy matching route, keep looking for a perfect fit
    let fuzzyMatch:
      | { foundRoute: TRouteLike; routeParams: Record<string, string> }
      | undefined = undefined
    for (const route of flatRoutes) {
      const matchedParams = getMatchedParams(route)

      if (matchedParams) {
        if (
          route.path !== '/' &&
          (matchedParams as Record<string, string>)['**']
        ) {
          if (!fuzzyMatch) {
            fuzzyMatch = { foundRoute: route, routeParams: matchedParams }
          }
        } else {
          foundRoute = route
          routeParams = matchedParams
          break
        }
      }
    }
    // did not find a perfect fit, so take the fuzzy matching route if it exists
    if (!foundRoute && fuzzyMatch) {
      foundRoute = fuzzyMatch.foundRoute
      routeParams = fuzzyMatch.routeParams
    }
  }

  let routeCursor: TRouteLike = foundRoute || routesById[rootRouteId]!

  const matchedRoutes: Array<TRouteLike> = [routeCursor]

  while (routeCursor.parentRoute) {
    routeCursor = routeCursor.parentRoute as TRouteLike
    matchedRoutes.push(routeCursor)
  }
  matchedRoutes.reverse()

  return { matchedRoutes, routeParams, foundRoute }
}

function applySearchMiddleware({
  search,
  dest,
  destRoutes,
  _includeValidateSearch,
}: {
  search: any
  dest: BuildNextOptions
  destRoutes: Array<AnyRoute>
  _includeValidateSearch: boolean | undefined
}) {
  const allMiddlewares =
    destRoutes.reduce(
      (acc, route) => {
        const middlewares: Array<SearchMiddleware<any>> = []

        if ('search' in route.options) {
          if (route.options.search?.middlewares) {
            middlewares.push(...route.options.search.middlewares)
          }
        }
        // TODO remove preSearchFilters and postSearchFilters in v2
        else if (
          route.options.preSearchFilters ||
          route.options.postSearchFilters
        ) {
          const legacyMiddleware: SearchMiddleware<any> = ({
            search,
            next,
          }) => {
            let nextSearch = search

            if (
              'preSearchFilters' in route.options &&
              route.options.preSearchFilters
            ) {
              nextSearch = route.options.preSearchFilters.reduce(
                (prev, next) => next(prev),
                search,
              )
            }

            const result = next(nextSearch)

            if (
              'postSearchFilters' in route.options &&
              route.options.postSearchFilters
            ) {
              return route.options.postSearchFilters.reduce(
                (prev, next) => next(prev),
                result,
              )
            }

            return result
          }
          middlewares.push(legacyMiddleware)
        }

        if (_includeValidateSearch && route.options.validateSearch) {
          const validate: SearchMiddleware<any> = ({ search, next }) => {
            const result = next(search)
            try {
              const validatedSearch = {
                ...result,
                ...(validateSearch(route.options.validateSearch, result) ??
                  undefined),
              }
              return validatedSearch
            } catch {
              // ignore errors here because they are already handled in matchRoutes
              return result
            }
          }

          middlewares.push(validate)
        }

        return acc.concat(middlewares)
      },
      [] as Array<SearchMiddleware<any>>,
    ) ?? []

  // the chain ends here since `next` is not called
  const final: SearchMiddleware<any> = ({ search }) => {
    if (!dest.search) {
      return {}
    }
    if (dest.search === true) {
      return search
    }
    return functionalUpdate(dest.search, search)
  }

  allMiddlewares.push(final)

  const applyNext = (index: number, currentSearch: any): any => {
    // no more middlewares left, return the current search
    if (index >= allMiddlewares.length) {
      return currentSearch
    }

    const middleware = allMiddlewares[index]!

    const next = (newSearch: any): any => {
      return applyNext(index + 1, newSearch)
    }

    return middleware({ search: currentSearch, next })
  }

  // Start applying middlewares
  return applyNext(0, search)
}
