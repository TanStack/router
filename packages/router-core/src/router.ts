import { Store, batch } from '@tanstack/store'
import {
  createBrowserHistory,
  createMemoryHistory,
  parseHref,
} from '@tanstack/history'
import invariant from 'tiny-invariant'
import {
  createControlledPromise,
  deepEqual,
  functionalUpdate,
  last,
  pick,
  replaceEqualDeep,
} from './utils'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
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
import { isNotFound } from './not-found'
import { setupScrollRestoration } from './scroll-restoration'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import { rootRouteId } from './root'
import { isRedirect, redirect } from './redirect'
import type { Segment } from './path'
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
  BeforeLoadContextOptions,
  LoaderFnContext,
  MakeRemountDepsOptionsUnion,
  RouteContextOptions,
  RouteMask,
  SearchMiddleware,
  SsrContextOptions,
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

declare global {
  interface Window {
    __TSR_ROUTER__?: AnyRouter
  }
}

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
  previousLocation?: ParsedLocation<FullSearchSchema<TRouteTree>>,
  locationToParse?: HistoryLocation,
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
    locationSearch: AnySchema,
    opts?: MatchRoutesOpts,
  ): Array<AnyRouteMatch>
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
) => AnyRouteMatch

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
    return this.options.isShell
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
      this.latestLocation = this.parseLocation()
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
    previousLocation,
    locationToParse,
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

    const location = parse(locationToParse ?? this.history.location)

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
    })
    return resolvedPath
  }

  get looseRoutesById() {
    return this.routesById as Record<string, AnyRoute>
  }

  /**
  @deprecated use the following signature instead
  ```ts
  matchRoutes (
    next: ParsedLocation,
    opts?: { preload?: boolean; throwOnError?: boolean },
  ): Array<AnyRouteMatch>;
  ```
*/
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

    const getParentContext = (parentMatch?: AnyRouteMatch) => {
      const parentMatchId = parentMatch?.id

      const parentContext = !parentMatchId
        ? ((this.options.context as any) ?? {})
        : (parentMatch.context ?? this.options.context ?? {})

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
        const parentStrictSearch = parentMatch?._strictSearch ?? {}

        try {
          const strictSearch =
            validateSearch(route.options.validateSearch, { ...parentSearch }) ??
            {}

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

      const { usedParams, interpolatedPath } = interpolatePath({
        path: route.fullPath,
        params: routeParams,
        decodeCharMap: this.pathParamsDecodeCharMap,
      })

      const matchId =
        interpolatePath({
          path: route.id,
          params: routeParams,
          leaveWildcards: true,
          decodeCharMap: this.pathParamsDecodeCharMap,
        }).interpolatedPath + loaderDepsHash

      // Waste not, want not. If we already have a match for this route,
      // reuse it. This is important for layout routes, which might stick
      // around between navigation actions that only change leaf routes.

      // Existing matches are matches that are already loaded along with
      // pending matches that are still loading
      const existingMatch = this.getMatch(matchId)

      const previousMatch = this.state.matches.find(
        (d) => d.routeId === route.id,
      )

      const cause = previousMatch ? 'stay' : 'enter'

      let match: AnyRouteMatch

      if (existingMatch) {
        match = {
          ...existingMatch,
          cause,
          params: previousMatch
            ? replaceEqualDeep(previousMatch.params, routeParams)
            : routeParams,
          _strictParams: usedParams,
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
          _strictParams: usedParams,
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
          paramsError: parseErrors[index],
          __routeContext: {},
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
          loadPromise: createControlledPromise(),
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
        const contextFnContext: RouteContextOptions<any, any, any, any> = {
          deps: match.loaderDeps,
          params: match.params,
          context: parentContext,
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
        match.__routeContext = route.options.context?.(contextFnContext) ?? {}

        match.context = {
          ...parentContext,
          ...match.__routeContext,
          ...match.__beforeLoadContext,
        }
      }
    })

    return matches
  }

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
    })
  }

  cancelMatch = (id: string) => {
    const match = this.getMatch(id)

    if (!match) return

    match.abortController.abort()
    this.updateMatch(id, (prev) => {
      clearTimeout(prev.pendingTimeout)
      return {
        ...prev,
        pendingTimeout: undefined,
      }
    })
  }

  cancelMatches = () => {
    this.state.pendingMatches?.forEach((match) => {
      this.cancelMatch(match.id)
    })
  }

  private comparePaths(path1: string, path2: string) {
    return path1.replace(/(.+)\/$/, '$1') === path2.replace(/(.+)\/$/, '$1')
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

      const lastMatch = last(allCurrentLocationMatches)!

      // First let's find the starting pathname
      // By default, start with the current location
      let fromPath = lastMatch.fullPath
      const toPath = dest.to
        ? this.resolvePathWithBase(fromPath, `${dest.to}`)
        : this.resolvePathWithBase(fromPath, '.')

      const routeIsChanging =
        !!dest.to &&
        !this.comparePaths(dest.to.toString(), fromPath) &&
        !this.comparePaths(toPath, fromPath)

      // If the route is changing we need to find the relative fromPath
      if (dest.unsafeRelative === 'path') {
        fromPath = currentLocation.pathname
      } else if (routeIsChanging && dest.from) {
        fromPath = dest.from

        // do this check only on navigations during test or development
        if (process.env.NODE_ENV !== 'production' && dest._isNavigate) {
          const allFromMatches = this.getMatchedRoutes(
            dest.from,
            undefined,
          ).matchedRoutes

          const matchedFrom = [...allCurrentLocationMatches]
            .reverse()
            .find((d) => {
              return this.comparePaths(d.fullPath, fromPath)
            })

          const matchedCurrent = [...allFromMatches].reverse().find((d) => {
            return this.comparePaths(d.fullPath, currentLocation.pathname)
          })

          // for from to be invalid it shouldn't just be unmatched to currentLocation
          // but the currentLocation should also be unmatched to from
          if (!matchedFrom && !matchedCurrent) {
            console.warn(`Could not find match for from: ${fromPath}`)
          }
        }
      }

      // From search should always use the current location
      const fromSearch = lastMatch.search
      // Same with params. It can't hurt to provide as many as possible
      const fromParams = { ...lastMatch.params }

      // Resolve the next to
      const nextTo = dest.to
        ? this.resolvePathWithBase(fromPath, `${dest.to}`)
        : this.resolvePathWithBase(fromPath, '.')

      // Resolve the next params
      let nextParams =
        dest.params === false || dest.params === null
          ? {}
          : (dest.params ?? true) === true
            ? fromParams
            : {
                ...fromParams,
                ...functionalUpdate(dest.params as any, fromParams),
              }

      // Interpolate the path first to get the actual resolved path, then match against that
      const interpolatedNextTo = interpolatePath({
        path: nextTo,
        params: nextParams ?? {},
      }).interpolatedPath

      const destRoutes = this.matchRoutes(
        interpolatedNextTo,
        {},
        {
          _buildLocation: true,
        },
      ).map((d) => this.looseRoutesById[d.routeId]!)

      // If there are any params, we need to stringify them
      if (Object.keys(nextParams).length > 0) {
        destRoutes
          .map((route) => {
            return (
              route.options.params?.stringify ?? route.options.stringifyParams
            )
          })
          .filter(Boolean)
          .forEach((fn) => {
            nextParams = { ...nextParams!, ...fn!(nextParams) }
          })
      }

      const nextPathname = interpolatePath({
        // Use the original template path for interpolation
        // This preserves the original parameter syntax including optional parameters
        path: nextTo,
        params: nextParams ?? {},
        leaveWildcards: false,
        leaveParams: opts.leaveParams,
        decodeCharMap: this.pathParamsDecodeCharMap,
      }).interpolatedPath

      // Resolve the next search
      let nextSearch = fromSearch
      if (opts._includeValidateSearch && this.options.search?.strict) {
        let validatedSearch = {}
        destRoutes.forEach((route) => {
          try {
            if (route.options.validateSearch) {
              validatedSearch = {
                ...validatedSearch,
                ...(validateSearch(route.options.validateSearch, {
                  ...validatedSearch,
                  ...nextSearch,
                }) ?? {}),
              }
            }
          } catch {
            // ignore errors here because they are already handled in matchRoutes
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
          const { from: _from, ...maskProps } = foundMask
          maskedDest = {
            ...pick(opts, ['from']),
            ...maskProps,
            params,
          }
          maskedNext = build(maskedDest)
        }
      }

      if (maskedNext) {
        const maskedFinal = build(maskedDest)
        next.maskedLocation = maskedFinal
      }

      return next
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
      return
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
    this.latestLocation = this.parseLocation(this.latestLocation)

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
        (d) => !pendingMatches.find((e) => e.id === d.id),
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

          await this.loadMatches({
            sync: opts?.sync,
            matches: this.state.pendingMatches as Array<AnyRouteMatch>,
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

                batch(() => {
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
    let updated!: AnyRouteMatch
    const isPending = this.state.pendingMatches?.find((d) => d.id === id)
    const isMatched = this.state.matches.find((d) => d.id === id)
    const isCached = this.state.cachedMatches.find((d) => d.id === id)

    const matchesKey = isPending
      ? 'pendingMatches'
      : isMatched
        ? 'matches'
        : isCached
          ? 'cachedMatches'
          : ''

    if (matchesKey) {
      this.__store.setState((s) => ({
        ...s,
        [matchesKey]: s[matchesKey]?.map((d) =>
          d.id === id ? (updated = updater(d)) : d,
        ),
      }))
    }

    return updated
  }

  getMatch: GetMatchFn = (matchId: string) => {
    return [
      ...this.state.cachedMatches,
      ...(this.state.pendingMatches ?? []),
      ...this.state.matches,
    ].find((d) => d.id === matchId)
  }

  loadMatches = async ({
    location,
    matches,
    preload: allPreload,
    onReady,
    updateMatch = this.updateMatch,
    sync,
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
    sync?: boolean
  }): Promise<Array<MakeRouteMatch>> => {
    let firstBadMatchIndex: number | undefined
    let rendered = false

    const triggerOnReady = async () => {
      if (!rendered) {
        rendered = true
        await onReady?.()
      }
    }

    const resolvePreload = (matchId: string) => {
      return !!(allPreload && !this.state.matches.find((d) => d.id === matchId))
    }

    // make sure the pending component is immediately rendered when hydrating a match that is not SSRed
    // the pending component was already rendered on the server and we want to keep it shown on the client until minPendingMs is reached
    if (!this.isServer && this.state.matches.find((d) => d._forcePending)) {
      triggerOnReady()
    }

    const handleRedirectAndNotFound = (match: AnyRouteMatch, err: any) => {
      if (isRedirect(err) || isNotFound(err)) {
        if (isRedirect(err)) {
          if (err.redirectHandled) {
            if (!err.options.reloadDocument) {
              throw err
            }
          }
        }

        match.beforeLoadPromise?.resolve()
        match.loaderPromise?.resolve()

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

        match.loadPromise?.resolve()

        if (isRedirect(err)) {
          rendered = true
          err.options._fromLocation = location
          err.redirectHandled = true
          err = this.resolveRedirect(err)
          throw err
        } else if (isNotFound(err)) {
          this._handleNotFound(matches, err, {
            updateMatch,
          })
          throw err
        }
      }
    }

    const shouldSkipLoader = (matchId: string) => {
      const match = this.getMatch(matchId)!
      // upon hydration, we skip the loader if the match has been dehydrated on the server
      if (!this.isServer && match._dehydrated) {
        return true
      }

      if (this.isServer) {
        if (match.ssr === false) {
          return true
        }
      }
      return false
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
                prev.loadPromise?.resolve()

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
              const parentMatchId = matches[index - 1]?.id
              const parentMatch = parentMatchId
                ? this.getMatch(parentMatchId)!
                : undefined

              const route = this.looseRoutesById[routeId]!

              const pendingMs =
                route.options.pendingMs ?? this.options.defaultPendingMs

              // on the server, determine whether SSR the current match or not
              if (this.isServer) {
                let ssr: boolean | 'data-only'
                // in SPA mode, only SSR the root route
                if (this.isShell()) {
                  ssr = matchId === rootRouteId
                } else {
                  const defaultSsr = this.options.defaultSsr ?? true
                  if (parentMatch?.ssr === false) {
                    ssr = false
                  } else {
                    let tempSsr: boolean | 'data-only'
                    if (route.options.ssr === undefined) {
                      tempSsr = defaultSsr
                    } else if (typeof route.options.ssr === 'function') {
                      const { search, params } = this.getMatch(matchId)!

                      function makeMaybe(value: any, error: any) {
                        if (error) {
                          return { status: 'error' as const, error }
                        }
                        return { status: 'success' as const, value }
                      }

                      const ssrFnContext: SsrContextOptions<any, any, any> = {
                        search: makeMaybe(search, existingMatch.searchError),
                        params: makeMaybe(params, existingMatch.paramsError),
                        location,
                        matches: matches.map((match) => ({
                          index: match.index,
                          pathname: match.pathname,
                          fullPath: match.fullPath,
                          staticData: match.staticData,
                          id: match.id,
                          routeId: match.routeId,
                          search: makeMaybe(match.search, match.searchError),
                          params: makeMaybe(match.params, match.paramsError),
                          ssr: match.ssr,
                        })),
                      }
                      tempSsr =
                        (await route.options.ssr(ssrFnContext)) ?? defaultSsr
                    } else {
                      tempSsr = route.options.ssr
                    }

                    if (tempSsr === true && parentMatch?.ssr === 'data-only') {
                      ssr = 'data-only'
                    } else {
                      ssr = tempSsr
                    }
                  }
                }
                updateMatch(matchId, (prev) => ({
                  ...prev,
                  ssr,
                }))
              }

              if (shouldSkipLoader(matchId)) {
                continue
              }

              const shouldPending = !!(
                onReady &&
                !this.isServer &&
                !resolvePreload(matchId) &&
                (route.options.loader ||
                  route.options.beforeLoad ||
                  routeNeedsPreload(route)) &&
                typeof pendingMs === 'number' &&
                pendingMs !== Infinity &&
                (route.options.pendingComponent ??
                  (this.options as any)?.defaultPendingComponent)
              )

              let executeBeforeLoad = true
              const setupPendingTimeout = () => {
                if (
                  shouldPending &&
                  this.getMatch(matchId)!.pendingTimeout === undefined
                ) {
                  const pendingTimeout = setTimeout(() => {
                    try {
                      // Update the match and prematurely resolve the loadMatches promise so that
                      // the pending component can start rendering
                      triggerOnReady()
                    } catch {}
                  }, pendingMs)
                  updateMatch(matchId, (prev) => ({
                    ...prev,
                    pendingTimeout,
                  }))
                }
              }
              if (
                // If we are in the middle of a load, either of these will be present
                // (not to be confused with `loadPromise`, which is always defined)
                existingMatch.beforeLoadPromise ||
                existingMatch.loaderPromise
              ) {
                setupPendingTimeout()

                // Wait for the beforeLoad to resolve before we continue
                await existingMatch.beforeLoadPromise
                const match = this.getMatch(matchId)!
                if (match.status === 'error') {
                  executeBeforeLoad = true
                } else if (
                  match.preload &&
                  (match.status === 'redirected' || match.status === 'notFound')
                ) {
                  handleRedirectAndNotFound(match, match.error)
                }
              }
              if (executeBeforeLoad) {
                // If we are not in the middle of a load OR the previous load failed, start it
                try {
                  updateMatch(matchId, (prev) => {
                    // explicitly capture the previous loadPromise
                    const prevLoadPromise = prev.loadPromise
                    return {
                      ...prev,
                      loadPromise: createControlledPromise<void>(() => {
                        prevLoadPromise?.resolve()
                      }),
                      beforeLoadPromise: createControlledPromise<void>(),
                    }
                  })

                  const { paramsError, searchError } = this.getMatch(matchId)!

                  if (paramsError) {
                    handleSerialError(index, paramsError, 'PARSE_PARAMS')
                  }

                  if (searchError) {
                    handleSerialError(index, searchError, 'VALIDATE_SEARCH')
                  }

                  setupPendingTimeout()

                  const abortController = new AbortController()

                  const parentMatchContext =
                    parentMatch?.context ?? this.options.context ?? {}

                  updateMatch(matchId, (prev) => ({
                    ...prev,
                    isFetching: 'beforeLoad',
                    fetchCount: prev.fetchCount + 1,
                    abortController,
                    context: {
                      ...parentMatchContext,
                      ...prev.__routeContext,
                    },
                  }))

                  const { search, params, context, cause } =
                    this.getMatch(matchId)!

                  const preload = resolvePreload(matchId)

                  const beforeLoadFnContext: BeforeLoadContextOptions<
                    any,
                    any,
                    any,
                    any,
                    any
                  > = {
                    search,
                    abortController,
                    params,
                    preload,
                    context,
                    location,
                    navigate: (opts: any) =>
                      this.navigate({ ...opts, _fromLocation: location }),
                    buildLocation: this.buildLocation,
                    cause: preload ? 'preload' : cause,
                    matches,
                  }

                  const beforeLoadContext =
                    await route.options.beforeLoad?.(beforeLoadFnContext)

                  if (
                    isRedirect(beforeLoadContext) ||
                    isNotFound(beforeLoadContext)
                  ) {
                    handleSerialError(index, beforeLoadContext, 'BEFORE_LOAD')
                  }

                  updateMatch(matchId, (prev) => {
                    return {
                      ...prev,
                      __beforeLoadContext: beforeLoadContext,
                      context: {
                        ...parentMatchContext,
                        ...prev.__routeContext,
                        ...beforeLoadContext,
                      },
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
            const matchPromises: Array<Promise<AnyRouteMatch>> = []

            validResolvedMatches.forEach(({ id: matchId, routeId }, index) => {
              matchPromises.push(
                (async () => {
                  let loaderShouldRunAsync = false
                  let loaderIsRunningAsync = false
                  const route = this.looseRoutesById[routeId]!

                  const executeHead = async () => {
                    const match = this.getMatch(matchId)
                    // in case of a redirecting match during preload, the match does not exist
                    if (!match) {
                      return
                    }
                    const assetContext = {
                      matches,
                      match,
                      params: match.params,
                      loaderData: match.loaderData,
                    }
                    const headFnContent =
                      await route.options.head?.(assetContext)
                    const meta = headFnContent?.meta
                    const links = headFnContent?.links
                    const headScripts = headFnContent?.scripts
                    const styles = headFnContent?.styles

                    const scripts = await route.options.scripts?.(assetContext)
                    const headers = await route.options.headers?.(assetContext)
                    return {
                      meta,
                      links,
                      headScripts,
                      headers,
                      scripts,
                      styles,
                    }
                  }

                  const potentialPendingMinPromise = async () => {
                    const latestMatch = this.getMatch(matchId)!
                    if (latestMatch.minPendingPromise) {
                      await latestMatch.minPendingPromise
                    }
                  }

                  const prevMatch = this.getMatch(matchId)!
                  if (shouldSkipLoader(matchId)) {
                    if (this.isServer) {
                      const head = await executeHead()
                      updateMatch(matchId, (prev) => ({
                        ...prev,
                        ...head,
                      }))
                      return this.getMatch(matchId)!
                    }
                  }
                  // there is a loaderPromise, so we are in the middle of a load
                  else if (prevMatch.loaderPromise) {
                    // do not block if we already have stale data we can show
                    // but only if the ongoing load is not a preload since error handling is different for preloads
                    // and we don't want to swallow errors
                    if (
                      prevMatch.status === 'success' &&
                      !sync &&
                      !prevMatch.preload
                    ) {
                      return this.getMatch(matchId)!
                    }
                    await prevMatch.loaderPromise
                    const match = this.getMatch(matchId)!
                    if (match.error) {
                      handleRedirectAndNotFound(match, match.error)
                    }
                  } else {
                    const parentMatchPromise = matchPromises[index - 1] as any

                    const getLoaderContext = (): LoaderFnContext => {
                      const {
                        params,
                        loaderDeps,
                        abortController,
                        context,
                        cause,
                      } = this.getMatch(matchId)!

                      const preload = resolvePreload(matchId)

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

                    const preload = resolvePreload(matchId)

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

                        // Actually run the loader and handle the result
                        try {
                          if (
                            !this.isServer ||
                            (this.isServer &&
                              this.getMatch(matchId)!.ssr === true)
                          ) {
                            this.loadRouteChunk(route)
                          }

                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            isFetching: 'loader',
                          }))

                          // Kick off the loader!
                          const loaderData =
                            await route.options.loader?.(getLoaderContext())

                          handleRedirectAndNotFound(
                            this.getMatch(matchId)!,
                            loaderData,
                          )
                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            loaderData,
                          }))

                          // Lazy option can modify the route options,
                          // so we need to wait for it to resolve before
                          // we can use the options
                          await route._lazyPromise
                          const head = await executeHead()
                          await potentialPendingMinPromise()

                          // Last but not least, wait for the the components
                          // to be preloaded before we resolve the match
                          await route._componentsPromise
                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            error: undefined,
                            status: 'success',
                            isFetching: false,
                            updatedAt: Date.now(),
                            ...head,
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
                          const head = await executeHead()
                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            error,
                            status: 'error',
                            isFetching: false,
                            ...head,
                          }))
                        }
                      } catch (err) {
                        const head = await executeHead()

                        updateMatch(matchId, (prev) => ({
                          ...prev,
                          loaderPromise: undefined,
                          ...head,
                        }))
                        handleRedirectAndNotFound(this.getMatch(matchId)!, err)
                      }
                    }

                    // If the route is successful and still fresh, just resolve
                    const { status, invalid } = this.getMatch(matchId)!
                    loaderShouldRunAsync =
                      status === 'success' &&
                      (invalid || (shouldReload ?? age > staleAge))
                    if (preload && route.options.preload === false) {
                      // Do nothing
                    } else if (loaderShouldRunAsync && !sync) {
                      loaderIsRunningAsync = true
                      ;(async () => {
                        try {
                          await runLoader()
                          const { loaderPromise, loadPromise } =
                            this.getMatch(matchId)!
                          loaderPromise?.resolve()
                          loadPromise?.resolve()
                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            loaderPromise: undefined,
                          }))
                        } catch (err) {
                          if (isRedirect(err)) {
                            await this.navigate(err.options)
                          }
                        }
                      })()
                    } else if (
                      status !== 'success' ||
                      (loaderShouldRunAsync && sync)
                    ) {
                      await runLoader()
                    } else {
                      // if the loader did not run, still update head.
                      // reason: parent's beforeLoad may have changed the route context
                      // and only now do we know the route context (and that the loader would not run)
                      const head = await executeHead()
                      updateMatch(matchId, (prev) => ({
                        ...prev,
                        ...head,
                      }))
                    }
                  }
                  if (!loaderIsRunningAsync) {
                    const { loaderPromise, loadPromise } =
                      this.getMatch(matchId)!
                    loaderPromise?.resolve()
                    loadPromise?.resolve()
                  }

                  updateMatch(matchId, (prev) => {
                    clearTimeout(prev.pendingTimeout)
                    return {
                      ...prev,
                      isFetching: loaderIsRunningAsync
                        ? prev.isFetching
                        : false,
                      loaderPromise: loaderIsRunningAsync
                        ? prev.loaderPromise
                        : undefined,
                      invalid: false,
                      pendingTimeout: undefined,
                      _dehydrated: undefined,
                    }
                  })
                  return this.getMatch(matchId)!
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
        if (isNotFound(err) && !allPreload) {
          await triggerOnReady()
        }

        throw err
      }
    }

    return matches
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
            : {}),
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

      return !(d.status !== 'error' && Date.now() - d.updatedAt < gcTime)
    }
    this.clearCache({ filter })
  }

  loadRouteChunk = (route: AnyRoute) => {
    if (route._lazyPromise === undefined) {
      if (route.lazyFn) {
        route._lazyPromise = route.lazyFn().then((lazyRoute) => {
          // explicitly don't copy over the lazy route's id
          const { id: _id, ...options } = lazyRoute.options
          Object.assign(route.options, options)
        })
      } else {
        route._lazyPromise = Promise.resolve()
      }
    }

    // If for some reason lazy resolves more lazy components...
    // We'll wait for that before pre attempt to preload any
    // components themselves.
    if (route._componentsPromise === undefined) {
      route._componentsPromise = route._lazyPromise.then(() =>
        Promise.all(
          componentTypes.map(async (type) => {
            const component = route.options[type]
            if ((component as any)?.preload) {
              await (component as any).preload()
            }
          }),
        ),
      )
    }
    return route._componentsPromise
  }

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
      matches = await this.loadMatches({
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

    const match = matchPathname(this.basepath, baseLocation.pathname, {
      ...opts,
      to: next.pathname,
    }) as any

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
    // Find the route that should handle the not found error
    // First check if a specific route is requested to show the error
    const routeCursor = this.routesById[err.routeId ?? ''] ?? this.routeTree
    const matchesByRouteId: Record<string, AnyRouteMatch> = {}

    // Setup routesByRouteId object for quick access
    for (const match of matches) {
      matchesByRouteId[match.routeId] = match
    }

    // Ensure a NotFoundComponent exists on the route
    if (
      !routeCursor.options.notFoundComponent &&
      (this.options as any)?.defaultNotFoundComponent
    ) {
      routeCursor.options.notFoundComponent = (
        this.options as any
      ).defaultNotFoundComponent
    }

    // Ensure we have a notFoundComponent
    invariant(
      routeCursor.options.notFoundComponent,
      'No notFoundComponent found. Please set a notFoundComponent on your route or provide a defaultNotFoundComponent to the router.',
    )

    // Find the match for this route
    const matchForRoute = matchesByRouteId[routeCursor.id]

    invariant(
      matchForRoute,
      'Could not find match for route: ' + routeCursor.id,
    )

    // Assign the error to the match - using non-null assertion since we've checked with invariant
    updateMatch(matchForRoute.id, (prev) => ({
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

export class SearchParamError extends Error {}

export class PathParamError extends Error {}

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

export const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
] as const

function routeNeedsPreload(route: AnyRoute) {
  for (const componentType of componentTypes) {
    if ((route.options[componentType] as any)?.preload) {
      return true
    }
  }
  return false
}

interface RouteLike {
  id: string
  isRoot?: boolean
  path?: string
  fullPath: string
  rank?: number
  parentRoute?: RouteLike
  children?: Array<RouteLike>
  options?: {
    caseSensitive?: boolean
  }
}

export type ProcessRouteTreeResult<TRouteLike extends RouteLike> = {
  routesById: Record<string, TRouteLike>
  routesByPath: Record<string, TRouteLike>
  flatRoutes: Array<TRouteLike>
}

const REQUIRED_PARAM_BASE_SCORE = 0.5
const OPTIONAL_PARAM_BASE_SCORE = 0.4
const WILDCARD_PARAM_BASE_SCORE = 0.25

function handleParam(segment: Segment, baseScore: number) {
  if (segment.prefixSegment && segment.suffixSegment) {
    return baseScore + 0.05
  }

  if (segment.prefixSegment) {
    return baseScore + 0.02
  }

  if (segment.suffixSegment) {
    return baseScore + 0.01
  }

  return baseScore
}

export function processRouteTree<TRouteLike extends RouteLike>({
  routeTree,
  initRoute,
}: {
  routeTree: TRouteLike
  initRoute?: (route: TRouteLike, index: number) => void
}): ProcessRouteTreeResult<TRouteLike> {
  const routesById = {} as Record<string, TRouteLike>
  const routesByPath = {} as Record<string, TRouteLike>

  const recurseRoutes = (childRoutes: Array<TRouteLike>) => {
    childRoutes.forEach((childRoute, i) => {
      initRoute?.(childRoute, i)

      const existingRoute = routesById[childRoute.id]

      invariant(
        !existingRoute,
        `Duplicate routes found with id: ${String(childRoute.id)}`,
      )

      routesById[childRoute.id] = childRoute

      if (!childRoute.isRoot && childRoute.path) {
        const trimmedFullPath = trimPathRight(childRoute.fullPath)
        if (
          !routesByPath[trimmedFullPath] ||
          childRoute.fullPath.endsWith('/')
        ) {
          routesByPath[trimmedFullPath] = childRoute
        }
      }

      const children = childRoute.children as Array<TRouteLike>

      if (children?.length) {
        recurseRoutes(children)
      }
    })
  }

  recurseRoutes([routeTree])

  const scoredRoutes: Array<{
    child: TRouteLike
    trimmed: string
    parsed: ReadonlyArray<Segment>
    index: number
    scores: Array<number>
    hasStaticAfter: boolean
    optionalParamCount: number
  }> = []

  const routes: Array<TRouteLike> = Object.values(routesById)

  routes.forEach((d, i) => {
    if (d.isRoot || !d.path) {
      return
    }

    const trimmed = trimPathLeft(d.fullPath)
    let parsed = parsePathname(trimmed)

    // Removes the leading slash if it is not the only remaining segment
    let skip = 0
    while (parsed.length > skip + 1 && parsed[skip]?.value === '/') {
      skip++
    }
    if (skip > 0) parsed = parsed.slice(skip)

    let optionalParamCount = 0
    let hasStaticAfter = false
    const scores = parsed.map((segment, index) => {
      if (segment.value === '/') {
        return 0.75
      }

      let baseScore: number | undefined = undefined
      if (segment.type === SEGMENT_TYPE_PARAM) {
        baseScore = REQUIRED_PARAM_BASE_SCORE
      } else if (segment.type === SEGMENT_TYPE_OPTIONAL_PARAM) {
        baseScore = OPTIONAL_PARAM_BASE_SCORE
        optionalParamCount++
      } else if (segment.type === SEGMENT_TYPE_WILDCARD) {
        baseScore = WILDCARD_PARAM_BASE_SCORE
      }

      if (baseScore) {
        // if there is any static segment (that is not an index) after a required / optional param,
        // we will boost this param so it ranks higher than a required/optional param without a static segment after it
        // JUST FOR SORTING, NOT FOR MATCHING
        for (let i = index + 1; i < parsed.length; i++) {
          const nextSegment = parsed[i]!
          if (
            nextSegment.type === SEGMENT_TYPE_PATHNAME &&
            nextSegment.value !== '/'
          ) {
            hasStaticAfter = true
            return handleParam(segment, baseScore + 0.2)
          }
        }

        return handleParam(segment, baseScore)
      }

      return 1
    })

    scoredRoutes.push({
      child: d,
      trimmed,
      parsed,
      index: i,
      scores,
      optionalParamCount,
      hasStaticAfter,
    })
  })

  const flatRoutes = scoredRoutes
    .sort((a, b) => {
      const minLength = Math.min(a.scores.length, b.scores.length)

      // Sort by segment-by-segment score comparison ONLY for the common prefix
      for (let i = 0; i < minLength; i++) {
        if (a.scores[i] !== b.scores[i]) {
          return b.scores[i]! - a.scores[i]!
        }
      }

      // If all common segments have equal scores, then consider length and specificity
      if (a.scores.length !== b.scores.length) {
        // If different number of optional parameters, fewer optional parameters wins (more specific)
        // only if both or none of the routes has static segments after the params
        if (a.optionalParamCount !== b.optionalParamCount) {
          if (a.hasStaticAfter === b.hasStaticAfter) {
            return a.optionalParamCount - b.optionalParamCount
          } else if (a.hasStaticAfter && !b.hasStaticAfter) {
            return -1
          } else if (!a.hasStaticAfter && b.hasStaticAfter) {
            return 1
          }
        }

        // If same number of optional parameters, longer path wins (for static segments)
        return b.scores.length - a.scores.length
      }

      // Sort by min available parsed value for alphabetical ordering
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

  return { routesById, routesByPath, flatRoutes }
}

export function getMatchedRoutes<TRouteLike extends RouteLike>({
  pathname,
  routePathname,
  basepath,
  caseSensitive,
  routesByPath,
  routesById,
  flatRoutes,
}: {
  pathname: string
  routePathname?: string
  basepath: string
  caseSensitive?: boolean
  routesByPath: Record<string, TRouteLike>
  routesById: Record<string, TRouteLike>
  flatRoutes: Array<TRouteLike>
}) {
  let routeParams: Record<string, string> = {}
  const trimmedPath = trimPathRight(pathname)
  const getMatchedParams = (route: TRouteLike) => {
    const result = matchPathname(basepath, trimmedPath, {
      to: route.fullPath,
      caseSensitive: route.options?.caseSensitive ?? caseSensitive,
      // we need fuzzy matching for `notFoundMode: 'fuzzy'`
      fuzzy: true,
    })
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
                ...(validateSearch(route.options.validateSearch, result) ?? {}),
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
