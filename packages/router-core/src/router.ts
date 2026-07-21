import { createBrowserHistory, parseHref } from '@tanstack/history'
import { isServer, loadServerRoute } from '@tanstack/router-core/isServer'
import {
  DEFAULT_PROTOCOL_ALLOWLIST,
  decodePath,
  deepEqual,
  encodePathLikeUrl,
  findLast,
  functionalUpdate,
  hasKeys,
  isDangerousProtocol,
  last,
  nullReplaceEqualDeep,
  replaceEqualDeep,
} from './utils'
import {
  buildRouteBranch,
  findFlatMatch,
  findRouteMatch,
  findSingleMatch,
  processRouteMasks,
  processRouteTree,
} from './new-process-route-tree'
import {
  cleanPath,
  compileDecodeCharMap,
  interpolatePath,
  resolvePath,
  trimPath,
  trimPathRight,
} from './path'
import { createLRUCache } from './lru-cache'
import { isNotFound } from './not-found'
import { setupScrollRestoration } from './scroll-restoration'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import { rootRouteId } from './root'
import { isRedirect } from './redirect'
import {
  loadClientRoute,
  preloadClientRoute,
  refreshClientRoute,
  transferMatchResources,
} from './load-client'
import { loadRouteChunk, replaceRouteChunk } from './route-chunks'
import {
  composeRewrites,
  executeRewriteInput,
  executeRewriteOutput,
  rewriteBasepath,
} from './rewrite'
import { createRouterStores } from './stores'
import type { LRUCache } from './lru-cache'
import type {
  ProcessRouteTreeResult,
  ProcessedTree,
} from './new-process-route-tree'
import type { SearchParser, SearchSerializer } from './searchParams'
import type { AnyRedirect, ResolvedRedirect } from './redirect'
import type {
  ActivePreload,
  LoadTransaction,
  LoaderFlight,
  PendingSession,
} from './load-client'
import type { ServerLoadResult } from './load-server'
import type {
  HistoryAction,
  HistoryLocation,
  HistoryState,
  ParsedHistoryState,
  RouterHistory,
} from '@tanstack/history'

import type {
  Awaitable,
  Constrain,
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
  LoaderStaleReloadMode,
  MakeRemountDepsOptionsUnion,
  RouteMask,
  SearchMiddleware,
  SearchMiddlewareMeta,
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
import type {
  Manifest,
  ManifestRouteAssets,
  RouterManagedTag,
} from './manifest'
import type { AnySchema, AnyValidator } from './validators'
import type { NavigateOptions, ResolveRelativePath, ToOptions } from './link'
import type {
  AnySerializationAdapter,
  ValidateSerializableInput,
} from './ssr/serializer/transformer'
import type { GetStoreConfig, RouterStores } from './stores'

export type ControllablePromise<T = any> = Promise<T> & {
  resolve: (value: T) => void
  reject: (value?: any) => void
}

export type InjectedHtmlEntry = Promise<string>

export interface Register {
  // Lots of things on here like...
  // router
  // config
  // ssr
}

export type RegisteredSsr<TRegister = Register> = TRegister extends {
  ssr: infer TSSR
}
  ? TSSR
  : false

export type RegisteredRouter<TRegister = Register> = TRegister extends {
  router: infer TRouter
}
  ? TRouter
  : AnyRouter

export type RegisteredConfigType<TRegister, TKey> = TRegister extends {
  config: infer TConfig
}
  ? TConfig extends {
      '~types': infer TTypes
    }
    ? TKey extends keyof TTypes
      ? TTypes[TKey]
      : unknown
    : unknown
  : unknown

export type DefaultRemountDepsFn<TRouteTree extends AnyRoute> = (
  opts: MakeRemountDepsOptionsUnion<TRouteTree>,
) => any

export interface DefaultRouterOptionsExtensions {}

export interface RouterOptionsExtensions extends DefaultRouterOptionsExtensions {}

export type SSROption = boolean | 'data-only'

export interface RouterOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated = undefined,
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
   * The default stale reload mode a route loader should use if no `loader.staleReloadMode` is provided.
   *
   * `'background'` preserves the current stale-while-revalidate behavior.
   * `'blocking'` waits for stale loader reloads to complete before resolving navigation.
   *
   * @default 'background'
   */
  defaultStaleReloadMode?: LoaderStaleReloadMode
  /**
   * The default `preloadStaleTime` a route should use if no preloadStaleTime is provided.
   *
   * @default 30_000 `(30 seconds)`
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloadstaletime-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)
   */
  defaultPreloadStaleTime?: number
  /**
   * The default `preloadGcTime` a route should use if none is provided.
   *
   * @default 300_000 `(5 minutes)`
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
   * @default 300_000 `(5 minutes)`
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
   * ```
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

  additionalContext?: any

  /**
   * A function that will be called when the router is dehydrated.
   *
   * The return value of this function will be serialized and stored in the router's dehydrated state.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#dehydrate-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading#critical-dehydrationhydration)
   */
  dehydrate?: () => Awaitable<
    Constrain<TDehydrated, ValidateSerializableInput<Register, TDehydrated>>
  >
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
  defaultSsr?: SSROption

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
  scrollRestoration?:
    | boolean
    | ((opts: { location: ParsedLocation }) => boolean)

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

  /**
   * An array of URL protocols to allow in links, redirects, and navigation.
   * Absolute URLs with protocols not in this list will be rejected.
   *
   * @default DEFAULT_PROTOCOL_ALLOWLIST (http:, https:, mailto:, tel:)
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#protocolallowlist-property)
   */
  protocolAllowlist?: Array<string>

  serializationAdapters?: ReadonlyArray<AnySerializationAdapter>
  /**
   * Configures how the router will rewrite the location between the actual href and the internal href of the router.
   *
   * @default undefined
   * @description You can provide a custom rewrite pair (in/out).
   * This is useful for shifting data from the origin to the path (for things like subdomain routing), or other advanced use cases.
   */
  rewrite?: LocationRewrite
  origin?: string
  ssr?: {
    nonce?: string
  }
}

export type LocationRewrite = {
  /**
   * A function that will be called to rewrite the URL before it is interpreted by the router from the history instance.
   *
   * @default undefined
   */
  input?: LocationRewriteFunction
  /**
   * A function that will be called to rewrite the URL before it is committed to the actual history instance from the router.
   *
   * @default undefined
   */
  output?: LocationRewriteFunction
}

/**
 * A function that will be called to rewrite the URL.
 *
 * @param url The URL to rewrite.
 * @returns The rewritten URL (as a URL instance or full href string) or undefined if no rewrite is needed.
 */
export type LocationRewriteFunction = ({
  url,
}: {
  url: URL
}) => undefined | string | URL

export interface RouterState<
  in out TRouteTree extends AnyRoute = AnyRoute,
  in out TRouteMatch = MakeRouteMatchUnion,
> {
  status: 'pending' | 'idle'
  isLoading: boolean
  matches: Array<TRouteMatch>
  location: ParsedLocation<FullSearchSchema<TRouteTree>>
  resolvedLocation?: ParsedLocation<FullSearchSchema<TRouteTree>>
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
  throwOnError?: boolean
  /** @internal */
  _controller?: AbortController
}

function routeNeedsLoad(route: AnyRoute): unknown {
  return (
    route.options.loader ||
    route.options.beforeLoad ||
    route.lazyFn ||
    (route.options.component as any)?.preload ||
    (route.options.pendingComponent as any)?.preload
  )
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
  'context' | 'serializationAdapters' | 'defaultSsr'
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
  > & {
    /**
     * @internal
     * A **trusted** built location that can be used to redirect to.
     */
    _builtLocation?: ParsedLocation
  },
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

export type GetMatchRoutesFn = (pathname: string) => {
  matchedRoutes: ReadonlyArray<AnyRoute>
  /** exhaustive params, still in their string form */
  routeParams: Record<string, string>
  foundRoute: AnyRoute | undefined
  parseError?: unknown
}

export type EmitFn = (routerEvent: RouterEvent) => void

export type LoadFn = (opts?: {
  sync?: boolean
  action?: { type: HistoryAction }
  _signal?: AbortSignal
}) => Promise<void>

export type CommitLocationFn = ({
  viewTransition,
  ignoreBlocker,
  ...next
}: ParsedLocation & CommitLocationOptions) => Promise<void>

export type StartTransitionFn = (
  fn: () => void,
  expected: Array<AnyRouteMatch>,
  urgent?: boolean,
) => Promise<boolean>

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

export type LoadRouteChunkFn = (route: AnyRoute) => Promise<Array<void>>

export type ResolveRedirect = (err: AnyRedirect) => ResolvedRedirect

export type ClearCacheFn<TRouter extends AnyRouter> = (opts?: {
  filter?: (d: MakeRouteMatchUnion<TRouter>) => boolean
}) => void

export interface ServerSsr {
  /** Framework-only: injects router-owned HTML into the SSR stream. */
  injectHtml: (html: string) => void
  /** Framework-only: injects a router-owned script tag into the SSR stream. */
  injectScript: (script: string) => void
  isDehydrated: () => boolean
  isSerializationFinished: () => boolean
  /** Framework-only: atomically reserves the pass-through stream path if safe. */
  reserveStreamFastPath: () => boolean
  /** Framework-only. */
  onInjectedHtml: (listener: () => void) => () => void
  /** Framework-only. */
  onRenderFinished: (listener: () => void) => void
  /** Framework-only. */
  setRenderFinished: () => void
  /** Framework-only. */
  cleanup: () => void
  /**
   * Register a listener invoked when the SSR request lifecycle ends (success,
   * error, abort, or stream lifetime expiry). Use to tear down per-request
   * resources whose references would otherwise pin the router (e.g. query
   * cache subscriptions, gcTime timers, abort controllers).
   *
   * Listeners run synchronously and exactly once. Errors are caught and logged.
   */
  onCleanup: (listener: () => void) => void
  /** Framework-only. */
  onSerializationFinished: (listener: () => void) => () => void
  /** Framework-only. */
  dehydrate: (opts?: { requestAssets?: ManifestRouteAssets }) => Promise<void>
  /** Framework-only. */
  takeBufferedScripts: () => RouterManagedTag | undefined
  /** Framework-only: takes buffered router-owned HTML. */
  takeBufferedHtml: () => string | undefined
  /** Framework-only. */
  liftScriptBarrier: () => void
}

export interface RouterSsrLifecycle {
  onServerSsrAttach?: Array<(serverSsr: ServerSsr) => void>
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
      }) => Array<string> | false)
}

// TODO where is this used? can we remove this?
/**
 * Convert an unknown error into a minimal, serializable object.
 * Includes name and message (and stack in development).
 */
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

/** Options for configuring trailing-slash behavior. */
export const trailingSlashOptions = {
  always: 'always',
  never: 'never',
  preserve: 'preserve',
} as const

export type TrailingSlashOption =
  (typeof trailingSlashOptions)[keyof typeof trailingSlashOptions]

/**
 * Compute whether path, href or hash changed between previous and current
 * resolved locations.
 */
export function getLocationChangeInfo(
  location: ParsedLocation,
  resolvedLocation?: ParsedLocation,
) {
  return {
    fromLocation: resolvedLocation,
    toLocation: location,
    pathChanged: resolvedLocation?.pathname !== location.pathname,
    hrefChanged: resolvedLocation?.href !== location.href,
    hashChanged: resolvedLocation?.hash !== location.hash,
  }
}

/** Return only state owned by the application, excluding history bookkeeping. */
export function _getUserHistoryState({
  key: _key,
  __TSR_key: _tsrKey,
  __TSR_index: _tsrIndex,
  __hashScrollIntoViewOptions: _hashScroll,
  __tempLocation: _tempLocation,
  __tempKey: _tempKey,
  ...state
}: ParsedHistoryState): HistoryState {
  return state
}

/** Run route lifecycle callbacks in leave/enter/stay phases. */
export function runRouteLifecycle(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  matches: Array<AnyRouteMatch>,
  isCurrent?: () => boolean,
): void {
  for (const match of previous) {
    if (isCurrent?.() === false) {
      return
    }
    if (!matches.some((candidate) => candidate.routeId === match.routeId)) {
      ;(router.routesById as Record<string, AnyRoute>)[
        match.routeId
      ]!.options.onLeave?.(match)
    }
  }
  for (const match of matches) {
    if (isCurrent?.() === false) {
      return
    }
    const route = (router.routesById as Record<string, AnyRoute>)[
      match.routeId
    ]!
    route.options[
      previous.some((candidate) => candidate.routeId === match.routeId)
        ? 'onStay'
        : 'onEnter'
    ]?.(match)
  }
}

type LightweightRouteMatchResult = {
  matchedRoutes: ReadonlyArray<AnyRoute>
  fullPath: string
  search: Record<string, unknown>
  params: Record<string, unknown>
}

type LightweightRouteMatchCacheEntry = [
  lastMatchId: string | undefined,
  result: LightweightRouteMatchResult,
]

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

declare global {
  // eslint-disable-next-line no-var
  var __TSR_CACHE__:
    | {
        routeTree: AnyRoute
        processRouteTreeResult: ProcessRouteTreeResult<AnyRoute>
        resolvePathCache: LRUCache<string, string>
      }
    | undefined
}

export interface RouterCore<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
  in out TDefaultStructuralSharingOption extends boolean,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> {
  shouldViewTransition?: boolean | ViewTransitionOptions
  /** Current client load transaction and owner of navigation writes. */
  _tx?: LoadTransaction
  /** Joinable in-flight loader generations keyed by match ID. */
  _flights?: Map<string, LoaderFlight>
  /** Whole speculative lanes that an identical navigation may adopt. */
  _preloads?: Map<string, ActivePreload>
  /** Owns cancellable work before a client transaction publishes. */
  _preflight?: AbortController
  /** Transfers one reconstructed SSR prefix into its initial client load. */
  _handoff?: HydrationHandoff
  /** Pending-boundary reveal and minimum-visible timing state. */
  _pending?: PendingSession
  /** Result of the latest server load, used to render or redirect. */
  _serverResult?: ServerLoadResult
  /** Framework callback that acknowledges an exact matches publication. */
  _rendered?: (matches: Array<AnyRouteMatch>) => void
  /** Development-only HMR reload for a route and its descendants. */
  _refreshRoute: (() => Promise<void>) | undefined
  /** Development-only replacement for a route's lazy chunk owner. */
  _replaceRouteChunk:
    | ((route: AnyRoute, lazyFn: AnyRoute['lazyFn']) => void)
    | undefined
}

export type HydrationHandoff = [
  claim: () => AbortController | undefined,
  finish: (matches?: Array<AnyRouteMatch>) => number | undefined,
]

/**
 * Core, framework-agnostic router engine that powers TanStack Router.
 *
 * Provides navigation, matching, loading, preloading, caching and event APIs
 * used by framework adapters (React/Solid). Prefer framework helpers like
 * `createRouter` in app code.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType
 */
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
  _scroll: {
    next: boolean
    // True until the current PUSH/REPLACE renders, so its hash owns window scroll.
    hash?: boolean
    restoring?: boolean
    restoration?: boolean
    reset?: boolean
  } = { next: true }
  subscribers = new Set<RouterListener<RouterEvent>>()
  /** Accepted off-screen loader generations keyed by match ID. */
  _cache = new Map<string, AnyRouteMatch>()
  /** Accepted semantic lane, excluding temporary pending presentation. */
  _committed: Array<AnyRouteMatch> = []

  // Must build in constructor
  stores!: RouterStores<TRouteTree>
  private getStoreConfig!: GetStoreConfig
  batch!: (fn: () => void) => void

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
  rewrite?: LocationRewrite
  origin?: string
  latestLocation!: ParsedLocation<FullSearchSchema<TRouteTree>>
  _pendingLocation?: ParsedLocation<FullSearchSchema<TRouteTree>>
  basepath!: string
  routeTree!: TRouteTree
  routesById!: RoutesById<TRouteTree>
  routesByPath!: RoutesByPath<TRouteTree>
  processedTree!: ProcessedTree<TRouteTree, any, any>
  resolvePathCache!: LRUCache<string, string>
  private matchCache = new WeakMap<
    AnyRoute | ParsedLocation,
    ReadonlyArray<AnyRoute> | LightweightRouteMatchCacheEntry
  >()
  isServer!: boolean
  pathParamsDecoder?: (encoded: string) => string
  protocolAllowlist!: Set<string>

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
    getStoreConfig: GetStoreConfig,
  ) {
    this.getStoreConfig = getStoreConfig

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
      protocolAllowlist:
        options.protocolAllowlist ?? DEFAULT_PROTOCOL_ALLOWLIST,
    })

    if (!(isServer ?? typeof document === 'undefined')) {
      self.__TSR_ROUTER__ = this
    }
  }

  startTransition: StartTransitionFn = async (fn) => {
    fn()
    return false
  }
  isShell() {
    return !!this.options.isShell
  }

  update: UpdateFn<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  > = (newOptions) => {
    if (process.env.NODE_ENV !== 'production') {
      if (newOptions.notFoundRoute) {
        console.warn(
          'The notFoundRoute API is deprecated and will be removed in the next major version. See https://tanstack.com/router/v1/docs/framework/react/guide/not-found-errors#migrating-from-notfoundroute for more info.',
        )
      }
    }

    const prevOptions = this.options
    const prevBasepath = this.basepath ?? prevOptions?.basepath ?? '/'
    const basepathWasUnset = this.basepath === undefined
    const prevRewriteOption = prevOptions?.rewrite

    this.options = {
      ...prevOptions,
      ...newOptions,
    }

    this.isServer =
      this.options.isServer ?? isServer ?? typeof document === 'undefined'

    this.protocolAllowlist = new Set(this.options.protocolAllowlist)

    if (this.options.pathParamsAllowedCharacters)
      this.pathParamsDecoder = compileDecodeCharMap(
        this.options.pathParamsAllowedCharacters,
      )

    if (
      !this.history ||
      (this.options.history && this.options.history !== this.history)
    ) {
      if (!this.options.history) {
        if (!(isServer ?? this.isServer)) {
          this.history = createBrowserHistory() as TRouterHistory
        }
      } else {
        this.history = this.options.history
      }
    }

    this.origin = this.options.origin
    if (!this.origin) {
      if (
        !(isServer ?? this.isServer) &&
        window?.origin &&
        window.origin !== 'null'
      ) {
        this.origin = window.origin
      } else {
        // fallback for the server, can be overridden by calling router.update({origin}) on the server
        this.origin = 'http://localhost'
      }
    }

    if (this.history) {
      this.updateLatestLocation()
    }

    if (this.options.routeTree !== this.routeTree) {
      this.routeTree = this.options.routeTree as TRouteTree
      let processRouteTreeResult: ProcessRouteTreeResult<TRouteTree>
      if (
        (isServer ?? this.isServer) &&
        process.env.NODE_ENV !== 'development' &&
        globalThis.__TSR_CACHE__ &&
        globalThis.__TSR_CACHE__.routeTree === this.routeTree
      ) {
        const cached = globalThis.__TSR_CACHE__
        this.resolvePathCache = cached.resolvePathCache
        processRouteTreeResult = cached.processRouteTreeResult as any
      } else {
        this.resolvePathCache = createLRUCache(1000)
        processRouteTreeResult = this.buildRouteTree()
        // only cache if nothing else is cached yet
        if (
          (isServer ?? this.isServer) &&
          process.env.NODE_ENV !== 'development' &&
          globalThis.__TSR_CACHE__ === undefined
        ) {
          globalThis.__TSR_CACHE__ = {
            routeTree: this.routeTree,
            processRouteTreeResult: processRouteTreeResult as any,
            resolvePathCache: this.resolvePathCache,
          }
        }
      }
      this.setRoutes(processRouteTreeResult)
    }

    if (!this.stores && this.latestLocation) {
      const config = this.getStoreConfig(this)
      this.batch = config.batch
      this.stores = createRouterStores(this.latestLocation, config)

      if (!(isServer ?? this.isServer)) {
        setupScrollRestoration(this)
      }
    }

    const nextBasepath = this.options.basepath ?? '/'
    const nextRewriteOption = this.options.rewrite
    const basepathChanged = basepathWasUnset || prevBasepath !== nextBasepath
    const rewriteChanged = prevRewriteOption !== nextRewriteOption

    if (basepathChanged || rewriteChanged) {
      this.basepath = nextBasepath

      const rewrites: Array<LocationRewrite> = []
      const trimmed = trimPath(nextBasepath)
      if (trimmed && trimmed !== '/') {
        rewrites.push(
          rewriteBasepath({
            basepath: nextBasepath,
          }),
        )
      }
      if (nextRewriteOption) {
        rewrites.push(nextRewriteOption)
      }

      this.rewrite =
        rewrites.length === 0
          ? undefined
          : rewrites.length === 1
            ? rewrites[0]
            : composeRewrites(rewrites)

      if (this.history) {
        this.updateLatestLocation()
      }

      if (this.stores) {
        this.stores.location.set(this.latestLocation)
      }
    }
  }

  get state(): RouterState<TRouteTree> {
    return this.stores.__store.get()
  }

  updateLatestLocation = () => {
    this.latestLocation = this.parseLocation(
      this.history.location,
      this.latestLocation,
    )
  }

  buildRouteTree = () => {
    const result = processRouteTree(
      this.routeTree,
      this.options.caseSensitive,
      (route, i) => {
        route.init({
          originalIndex: i,
        })
      },
    )
    if (this.options.routeMasks) {
      processRouteMasks(this.options.routeMasks, result.processedTree)
    }

    return result
  }

  setRoutes({
    routesById,
    routesByPath,
    processedTree,
  }: ProcessRouteTreeResult<TRouteTree>) {
    this.routesById = routesById as RoutesById<TRouteTree>
    this.routesByPath = routesByPath as RoutesByPath<TRouteTree>
    this.processedTree = processedTree

    const notFoundRoute = this.options.notFoundRoute

    if (notFoundRoute) {
      notFoundRoute.init({
        originalIndex: 99999999999,
      })
      this.routesById[notFoundRoute.id] = notFoundRoute
    }
  }

  /**
   * Subscribe to router lifecycle events like `onBeforeNavigate`, `onLoad`,
   * `onResolved`, etc. Returns an unsubscribe function.
   *
   * @link https://tanstack.com/router/latest/docs/framework/react/api/router/RouterEventsType
   */
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
    for (const listener of this.subscribers) {
      if (listener.eventType === routerEvent.type) {
        try {
          listener.fn(routerEvent)
        } catch (e) {
          console.error(e)
        }
      }
    }
  }

  /**
   * Parse a HistoryLocation into a strongly-typed ParsedLocation using the
   * current router options, rewrite rules and search parser/stringifier.
   */
  parseLocation: ParseLocationFn<TRouteTree> = (
    locationToParse,
    previousLocation,
  ) => {
    const parse = ({
      pathname,
      search,
      hash,
      href,
      state,
    }: HistoryLocation): ParsedLocation<FullSearchSchema<TRouteTree>> => {
      // Fast path: no rewrite configured and pathname doesn't need encoding
      // Characters that need encoding: space, high unicode, control chars
      // eslint-disable-next-line no-control-regex
      if (!this.rewrite && !/[ \x00-\x1f\x7f\u0080-\uffff]/.test(pathname)) {
        const parsedSearch = this.options.parseSearch(search)
        const searchStr = this.options.stringifySearch(parsedSearch)

        return {
          href: pathname + searchStr + hash,
          publicHref: pathname + searchStr + hash,
          pathname: decodePath(pathname).path,
          external: false,
          searchStr,
          search: nullReplaceEqualDeep(
            previousLocation?.search,
            parsedSearch,
          ) as any,
          hash: decodePath(hash.slice(1)).path,
          state: replaceEqualDeep(previousLocation?.state, state),
        }
      }

      // Before we do any processing, we need to allow rewrites to modify the URL
      // build up the full URL by combining the href from history with the router's origin
      const fullUrl = new URL(href, this.origin)

      const url = executeRewriteInput(this.rewrite, fullUrl)

      const parsedSearch = this.options.parseSearch(url.search)
      const searchStr = this.options.stringifySearch(parsedSearch)
      // Make sure our final url uses the re-stringified pathname, search, and has for consistency
      // (We were already doing this, so just keeping it for now)
      url.search = searchStr

      const fullPath = url.href.replace(url.origin, '')

      return {
        href: fullPath,
        publicHref: href,
        pathname: decodePath(url.pathname).path,
        external: !!this.rewrite && url.origin !== this.origin,
        searchStr,
        search: nullReplaceEqualDeep(
          previousLocation?.search,
          parsedSearch,
        ) as any,
        hash: decodePath(url.hash.slice(1)).path,
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

  /** Resolve a path using the router's trailing-slash policy. */
  resolvePathWithBase = (from: string, path: string) => {
    return resolvePath({
      base: from,
      to: path.includes('//') ? cleanPath(path) : path,
      trailingSlash: this.options.trailingSlash,
      cache: this.resolvePathCache,
    })
  }

  private getRouteBranch(route: AnyRoute) {
    let branch = this.matchCache.get(route) as
      | ReadonlyArray<AnyRoute>
      | undefined
    if (!branch) {
      branch = buildRouteBranch(route)
      this.matchCache.set(route, branch)
    }
    return branch
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
    const matchedRoutesResult = this.getMatchedRoutes(next.pathname)
    const { foundRoute, routeParams } = matchedRoutesResult
    let { matchedRoutes } = matchedRoutesResult
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
        matchedRoutes = [...matchedRoutes, this.options.notFoundRoute]
      } else {
        // If there is no routes found during path matching
        isGlobalNotFound = true
      }
    }

    const _notFoundRouteId = isGlobalNotFound
      ? findGlobalNotFoundRouteId(this.options.notFoundMode, matchedRoutes)
      : undefined

    const matches = new Array<AnyRouteMatch>(matchedRoutes.length)
    const committed = this._committed
    const previousAt = (route: AnyRoute, index: number) => {
      const match = committed[index]
      return match?.routeId === route.id
        ? match
        : route === this.options.notFoundRoute
          ? committed.find((candidate) => candidate.routeId === route.id)
          : undefined
    }

    for (let index = 0; index < matchedRoutes.length; index++) {
      const route = matchedRoutes[index]!
      // Take each matched route and resolve + validate its search params
      // This has to happen serially because each route's search params
      // can depend on the parent route's search params
      // It must also happen before we create the match so that we can
      // pass the search params to the route's potential key function
      // which is used to uniquely identify the route match in state

      const parentMatch = matches[index - 1]

      let preMatchSearch: Record<string, any>
      let strictMatchSearch: Record<string, any>
      let searchError: any
      {
        // Validate the search params and stabilize them
        const parentSearch = parentMatch?.search ?? next.search
        const parentStrictSearch = parentMatch?._strictSearch ?? undefined

        try {
          const strictSearch =
            validateSearch(route.options.validateSearch, { ...parentSearch }) ??
            undefined

          preMatchSearch = {
            ...parentSearch,
            ...strictSearch,
          }
          strictMatchSearch = { ...parentStrictSearch, ...strictSearch }
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

          preMatchSearch = parentSearch
          strictMatchSearch = {}
          searchError = searchParamError
        }
      }
      // This is where we need to call route.options.loaderDeps() to get any additional
      // deps that the route's loader function might need to run. We need to do this
      // before we create the match so that we can pass the deps to the route's
      // potential key function which is used to uniquely identify the route match in state

      let loaderDeps: any = ''
      let loaderDepsHash = ''
      try {
        loaderDeps =
          route.options.loaderDeps?.({
            search: preMatchSearch,
          }) ?? ''
        loaderDepsHash = loaderDeps ? JSON.stringify(loaderDeps) || '' : ''
      } catch (cause) {
        if (opts?.throwOnError) {
          throw cause
        }
        searchError ??= cause
      }
      const { interpolatedPath, usedParams } = interpolatePath({
        path: route.fullPath,
        params: routeParams,
        decoder: this.pathParamsDecoder,
        server: this.isServer,
      })

      // Seed planning from the accepted same-ID cache generation first, then
      // from the committed generation for this route. Presentation stores are
      // deliberately not a semantic reuse authority.
      const matchId =
        // route.id for disambiguation
        route.id +
        // interpolatedPath for param changes
        interpolatedPath +
        // explicit deps
        loaderDepsHash

      const previousMatch = previousAt(route, index)
      const existingMatch =
        this._cache.get(matchId) ??
        (previousMatch?.id === matchId ? previousMatch : undefined)

      const strictParams = existingMatch?._strictParams ?? usedParams

      let paramsError: unknown

      if (!existingMatch) {
        try {
          extractStrictParams(route, strictParams)
        } catch (err: any) {
          if (isNotFound(err) || isRedirect(err)) {
            paramsError = err
          } else {
            paramsError = new PathParamError(err.message, {
              cause: err,
            })
          }

          if (opts?.throwOnError) {
            throw paramsError
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
          params: previousMatch?.params ?? routeParams,
          _strictParams: strictParams,
          search: previousMatch
            ? nullReplaceEqualDeep(previousMatch.search, preMatchSearch)
            : nullReplaceEqualDeep(existingMatch.search, preMatchSearch),
          _strictSearch: strictMatchSearch,
          searchError,
        }
      } else {
        const status = routeNeedsLoad(route) ? 'pending' : 'success'

        match = {
          id: matchId,
          ssr: (isServer ?? this.isServer) ? undefined : route.options.ssr,
          index,
          routeId: route.id,
          params: previousMatch?.params ?? routeParams,
          _strictParams: strictParams,
          pathname: interpolatedPath,
          updatedAt: Date.now(),
          search: previousMatch
            ? nullReplaceEqualDeep(previousMatch.search, preMatchSearch)
            : preMatchSearch,
          _strictSearch: strictMatchSearch,
          searchError,
          status,
          isFetching: false,
          error: undefined,
          paramsError,
          context: {},
          abortController: opts?._controller ?? new AbortController(),
          cause,
          loaderDeps: previousMatch
            ? replaceEqualDeep(previousMatch.loaderDeps, loaderDeps)
            : loaderDeps,
          invalid: false,
          preload: false,
          staticData: route.options.staticData || {},
          fullPath: route.fullPath,
        }
      }

      // If we have a global not found, mark the right match as global not found
      const _notFound = _notFoundRouteId === route.id
      if (match._notFound && !_notFound) {
        match.error = undefined
      }
      match._notFound = _notFound

      matches[index] = match
    }

    for (let index = 0; index < matches.length; index++) {
      const match = matches[index]!
      match.params =
        match.cause === 'stay'
          ? nullReplaceEqualDeep(match.params, routeParams)
          : routeParams
      if (opts?._controller) {
        match.context = {}
      }
    }

    return matches
  }

  getMatchedRoutes: GetMatchRoutesFn = (pathname) => {
    const routeParams: Record<string, string> = Object.create(null)
    const match = findRouteMatch(
      trimPathRight(pathname),
      this.processedTree,
      true,
    )
    if (match) {
      Object.assign(routeParams, match.rawParams)
    }
    return {
      matchedRoutes: match?.branch || [this.routesById[rootRouteId]!],
      routeParams,
      foundRoute: match?.route,
    }
  }

  /**
   * Lightweight route matching for buildLocation.
   * Only computes fullPath, accumulated search, and params - skipping expensive
   * operations like AbortController, loaderDeps, and full match objects.
   */
  private matchRoutesLightweight(
    location: ParsedLocation,
  ): LightweightRouteMatchResult {
    const lastRouteId = last(this.stores.ids.get())
    const lastStateMatch = lastRouteId
      ? this.stores.byRoute.get(lastRouteId)!.get()
      : undefined
    const lastStateMatchId = lastStateMatch?.id
    const cached = this.matchCache.get(location) as
      | LightweightRouteMatchCacheEntry
      | undefined
    if (cached && cached[0] === lastStateMatchId) {
      return cached[1]
    }

    const { matchedRoutes, routeParams } = this.getMatchedRoutes(
      location.pathname,
    )
    const lastRoute = last(matchedRoutes)!

    // I don't know if we should run the full search middleware chain, or just validateSearch
    // // Accumulate search validation through the route chain
    // const accumulatedSearch: Record<string, unknown> = applySearchMiddleware({
    //   search: { ...location.search },
    //   dest: location,
    //   destRoutes: matchedRoutes,
    //   _includeValidateSearch: true,
    // })

    // Accumulate search validation through route chain
    const accumulatedSearch = { ...location.search }
    for (const route of matchedRoutes) {
      try {
        Object.assign(
          accumulatedSearch,
          validateSearch(route.options.validateSearch, accumulatedSearch),
        )
      } catch {
        // Ignore errors, we're not actually routing
      }
    }

    // Determine params: reuse from state if possible, otherwise parse
    const canReuseParams =
      lastStateMatch &&
      lastStateMatch.routeId === lastRoute.id &&
      lastStateMatch.pathname === location.pathname

    let params: Record<string, unknown>
    if (canReuseParams) {
      params = lastStateMatch.params
    } else {
      // Parse params through the route chain
      const strictParams: Record<string, unknown> = Object.assign(
        Object.create(null),
        routeParams,
      )
      for (const route of matchedRoutes) {
        try {
          extractStrictParams(route, strictParams)
        } catch {
          // Ignore errors, we're not actually routing
        }
      }
      params = strictParams
    }

    const result = {
      matchedRoutes,
      fullPath: lastRoute.fullPath,
      search: accumulatedSearch,
      params,
    }
    this.matchCache.set(location, [lastStateMatchId, result])
    return result
  }

  /**
   * Build the next ParsedLocation from navigation options without committing.
   * Resolves `to`/`from`, params/search/hash/state, applies search validation
   * and middlewares, and returns a stable, stringified location object.
   *
   * @link https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType#buildlocation-method
   */
  buildLocation: BuildLocationFn = (opts) => {
    const build = (
      dest: BuildNextOptions & {
        unmaskOnReload?: boolean
      } = {},
    ): ParsedLocation => {
      // We allow the caller to override the current location
      const currentLocation =
        dest._fromLocation || this._pendingLocation || this.latestLocation

      // Use lightweight matching - only computes what buildLocation needs
      // (fullPath, search, params) without creating full match objects
      const lightweightResult = this.matchRoutesLightweight(currentLocation)

      // check that from path exists in the current route tree
      // do this check only on navigations during test or development
      if (
        dest.from &&
        process.env.NODE_ENV !== 'production' &&
        dest._isNavigate
      ) {
        const allFromMatches = this.getMatchedRoutes(dest.from).matchedRoutes

        const matchedFrom = findLast(lightweightResult.matchedRoutes, (d) => {
          return comparePaths(d.fullPath, dest.from!)
        })

        const matchedCurrent = findLast(allFromMatches, (d) => {
          return comparePaths(d.fullPath, lightweightResult.fullPath)
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
          : (dest.from ?? lightweightResult.fullPath)
      const destTo = dest.to ? `${dest.to}` : undefined

      // From search should always use the current location
      const fromSearch = lightweightResult.search
      // Same with params. It can't hurt to provide as many as possible
      const fromParams = Object.assign(
        Object.create(null),
        lightweightResult.params,
      )

      const isAbsoluteTo = destTo?.charCodeAt(0) === 47
      const sourcePath = isAbsoluteTo
        ? '/'
        : this.resolvePathWithBase(defaultedFromPath, '.')

      // Resolve the destination. Absolute destinations don't need the source path.
      const nextTo = destTo
        ? this.resolvePathWithBase(sourcePath, destTo)
        : sourcePath

      // Resolve the next params
      const nextParams = resolveNextParams(dest.params, fromParams)

      const destRoute = this.routesByPath[
        trimPathRight(nextTo) as keyof typeof this.routesByPath
      ] as AnyRoute | undefined

      let destRoutes: ReadonlyArray<AnyRoute>
      if (destRoute) {
        destRoutes = this.getRouteBranch(destRoute)
      } else if (nextTo.includes('$')) {
        // Route templates must match routesByPath exactly. A miss here is a
        // typed destination mismatch, not a concrete URL to route-match.
        destRoutes = []
      } else {
        const destMatchResult = this.getMatchedRoutes(nextTo)
        destRoutes = destMatchResult.matchedRoutes

        if (
          this.options.notFoundRoute &&
          (!destMatchResult.foundRoute ||
            (destMatchResult.foundRoute.path !== '/' &&
              destMatchResult.routeParams['**']))
        ) {
          destRoutes = [...destRoutes, this.options.notFoundRoute]
        }
      }

      // If there are any params, we need to stringify them
      if (destRoutes.length && hasKeys(nextParams)) {
        for (const route of destRoutes) {
          const fn =
            route.options.params?.stringify ?? route.options.stringifyParams
          if (fn) {
            try {
              Object.assign(nextParams, fn(nextParams))
            } catch {
              // Ignore errors here. When a paired parseParams is defined,
              // extractStrictParams will re-throw during route matching,
              // storing the error on the match and allowing the route's
              // errorComponent to render. If no parseParams is defined,
              // the stringify error is silently dropped.
            }
          }
        }
      }

      const nextPathname = opts.leaveParams
        ? // Keep path params uninterpolated for matchRoute/template matching.
          nextTo
        : decodePath(
            interpolatePath({
              path: nextTo,
              params: nextParams,
              decoder: this.pathParamsDecoder,
              server: this.isServer,
            }).interpolatedPath,
          ).path

      if (
        process.env.NODE_ENV !== 'production' &&
        destRoute &&
        !opts.leaveParams
      ) {
        try {
          const roundTrip = this.getMatchedRoutes(nextPathname)
          if (roundTrip.foundRoute?.id !== destRoute.id) {
            console.warn(
              `Generated path "${nextPathname}" for route "${destRoute.id}" matched route "${roundTrip.foundRoute?.id}" instead. This can happen when multiple route templates resolve to the same URL. Use the route template that matches the intended route, or adjust params.stringify if it changed the target path.`,
            )
          }
        } catch {
          // Ignore roundtrip validation errors. The generated location will be
          // handled by the normal navigation flow.
        }
      }

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

      nextSearch = applySearchMiddleware(
        nextSearch,
        dest,
        destRoutes,
        opts._includeValidateSearch,
      )

      // Replace the equal deep
      nextSearch = nullReplaceEqualDeep(fromSearch, nextSearch)

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

      // Create the full path of the location
      const fullPath = `${nextPathname}${searchStr}${hashStr}`

      // Compute href and publicHref without URL construction when no rewrite
      let href: string
      let publicHref: string
      let external = false

      if (this.rewrite) {
        // With rewrite, we need to construct URL to apply the rewrite
        const url = new URL(fullPath, this.origin)
        const rewrittenUrl = executeRewriteOutput(this.rewrite, url)
        href = url.href.replace(url.origin, '')
        // If rewrite changed the origin, publicHref needs full URL
        // Otherwise just use the path components
        if (rewrittenUrl.origin !== this.origin) {
          publicHref = rewrittenUrl.href
          external = true
        } else {
          publicHref =
            rewrittenUrl.pathname + rewrittenUrl.search + rewrittenUrl.hash
        }
      } else {
        // Fast path: no rewrite, skip URL construction entirely
        // fullPath is already the correct href (origin-stripped)
        // We need to encode non-ASCII (unicode) characters for the href
        // since decodePath decoded them from the interpolated path
        href = encodePathLikeUrl(fullPath)
        publicHref = href
      }

      return {
        publicHref,
        href,
        pathname: nextPathname,
        search: nextSearch,
        searchStr,
        state: nextState as any,
        hash: hash ?? '',
        external,
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
        const params = Object.create(null)

        if (this.options.routeMasks) {
          const match = findFlatMatch<RouteMask<TRouteTree>>(
            next.pathname,
            this.processedTree,
          )
          if (match) {
            Object.assign(params, match.rawParams) // Copy params, because they're cached
            const {
              from: _from,
              params: maskParams,
              ...maskProps
            } = match.route

            // If mask has a params function, call it with the matched params as context
            // Otherwise, use the matched params or the provided params value
            const nextParams = resolveNextParams(maskParams, params)

            maskedDest = {
              from: opts.from,
              ...maskProps,
              params: nextParams,
            }
            maskedNext = build(maskedDest)
          }
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

  _commitPromise: (Promise<void> & { resolve: () => void }) | undefined

  /**
   * Commit a previously built location to history (push/replace), optionally
   * using view transitions and scroll restoration options.
   */
  commitLocation: CommitLocationFn = async ({
    viewTransition,
    ignoreBlocker,
    ...next
  }) => {
    let historyAction: HistoryAction | undefined
    const isSameLocation =
      trimPathRight(this.latestLocation.href) === trimPathRight(next.href) &&
      deepEqual(
        _getUserHistoryState(next.state),
        _getUserHistoryState(this.latestLocation.state),
      )

    const previousCommitPromise = this._commitPromise
    let resolve!: () => void
    const commitPromise = new Promise<void>((done) => {
      resolve = done
    }) as Promise<void> & { resolve: () => void }
    commitPromise.resolve = () => {
      resolve()
      previousCommitPromise?.resolve()
    }
    this._commitPromise = commitPromise

    // Don't commit to history if nothing changed
    if (isSameLocation) {
      this.load()
    } else {
      let {
        // eslint-disable-next-line prefer-const
        maskedLocation,
        // eslint-disable-next-line prefer-const
        hashScrollIntoView,
        ...nextHistory
      } = next

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

      historyAction = next.replace ? 'REPLACE' : 'PUSH'

      this.history[historyAction === 'REPLACE' ? 'replace' : 'push'](
        nextHistory.publicHref,
        nextHistory.state,
        { ignoreBlocker },
      )
    }

    this._scroll.next = next.resetScroll ?? true

    if (!this.history.subscribers.size) {
      this.load(
        historyAction
          ? {
              action: { type: historyAction },
            }
          : undefined,
      )
    }

    return this._commitPromise
  }

  /** Convenience helper: build a location from options, then commit it. */
  buildAndCommitLocation = ({
    replace,
    resetScroll,
    hashScrollIntoView,
    viewTransition,
    ignoreBlocker,
    _redirects,
    href,
    ...rest
  }: BuildNextOptions &
    CommitLocationOptions & { _redirects?: number } = {}) => {
    if (href) {
      const currentIndex = this.history.location.state.__TSR_index

      const parsed = parseHref(href, {
        __TSR_index: replace ? currentIndex : currentIndex + 1,
      })

      // If the href contains the basepath, we need to strip it before setting `to`
      // because `buildLocation` will add the basepath back when creating the final URL.
      // Without this, hrefs like '/app/about' would become '/app/app/about'.
      const hrefUrl = new URL(parsed.pathname, this.origin)
      const rewrittenUrl = executeRewriteInput(this.rewrite, hrefUrl)

      rest.to = rewrittenUrl.pathname
      rest.search = this.options.parseSearch(parsed.search)
      // remove the leading `#` from the hash
      rest.hash = parsed.hash.slice(1)
    }

    const location = this.buildLocation({
      ...(rest as any),
      _includeValidateSearch: true,
    })
    if (_redirects) {
      ;(location as typeof location & { _redirects?: number })._redirects =
        _redirects
    }

    this._pendingLocation = location as ParsedLocation<
      FullSearchSchema<TRouteTree>
    >

    const commitPromise = this.commitLocation({
      ...location,
      viewTransition,
      replace,
      resetScroll,
      hashScrollIntoView,
      ignoreBlocker,
    })

    // Clear pending location after commit starts
    // We do this on next microtask to allow synchronous navigate calls to chain
    queueMicrotask(() => {
      if (this._pendingLocation === location) {
        this._pendingLocation = undefined
      }
    })

    return commitPromise
  }

  /**
   * Imperatively navigate using standard `NavigateOptions`. When `reloadDocument`
   * or an absolute `href` is provided, performs a full document navigation.
   * Otherwise, builds and commits a client-side location.
   *
   * @link https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType
   */
  navigate: NavigateFn = async ({
    to,
    reloadDocument,
    href,
    publicHref,
    ...rest
  }) => {
    let hrefIsUrl = false

    if (href) {
      try {
        new URL(`${href}`)
        hrefIsUrl = true
      } catch {}
    }

    if (hrefIsUrl && !reloadDocument) {
      reloadDocument = true
    }

    if (reloadDocument) {
      // When to is provided, always build a location to get the proper publicHref
      // (this handles redirects where href might be an internal path from resolveRedirect)
      // When only href is provided (no to), use it directly as it should already
      // be a complete path (possibly with basepath)
      if (to !== undefined || !href) {
        const location = this.buildLocation({ to, ...rest } as any)
        // Use publicHref which contains the path (origin-stripped is fine for reload)
        href = href ?? location.publicHref
        publicHref = publicHref ?? location.publicHref
      }

      // Use publicHref when available and href is not a full URL,
      // otherwise use href directly (which may already include basepath)
      const reloadHref = !hrefIsUrl && publicHref ? publicHref : href

      // Block dangerous protocols like javascript:, blob:, data:
      // These could execute arbitrary code if passed to window.location
      if (isDangerousProtocol(reloadHref, this.protocolAllowlist)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `Blocked navigation to dangerous protocol: ${reloadHref}`,
          )
        }
        return
      }

      // Check blockers for external URLs unless ignoreBlocker is true
      if (!rest.ignoreBlocker) {
        // Cast to access internal getBlockers method
        const historyWithBlockers = this.history as any
        const blockers = historyWithBlockers.getBlockers?.() ?? []
        for (const blocker of blockers) {
          if (blocker?.blockerFn) {
            const shouldBlock = await blocker.blockerFn({
              currentLocation: this.latestLocation,
              nextLocation: this.latestLocation, // External URLs don't have a next location in our router
              action: 'PUSH',
            })
            if (shouldBlock) {
              return
            }
          }
        }
      }

      if (rest.replace) {
        window.location.replace(reloadHref)
      } else {
        window.location.href = reloadHref
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

  load: LoadFn = async (opts): Promise<void> => {
    if (isServer ?? this.isServer) {
      return loadServerRoute(this, opts)
    }

    this.updateLatestLocation()
    if (opts?.action) {
      this._scroll.hash =
        opts.action.type === 'PUSH' || opts.action.type === 'REPLACE'
    }
    await loadClientRoute(this, opts)
  }

  startViewTransition = (fn: () => Promise<void>) => {
    // Determine if we should start a view transition from the navigation
    // or from the router default
    const shouldViewTransition =
      this.shouldViewTransition ?? this.options.defaultViewTransition

    // Reset the view transition flag
    this.shouldViewTransition = undefined

    // Attempt to start a view transition (or just apply the changes if we can't)
    if (
      shouldViewTransition &&
      !(isServer ?? typeof document === 'undefined') &&
      typeof (document as any).startViewTransition === 'function'
    ) {
      // lib.dom.ts doesn't support viewTransition types variant yet.
      // TODO: Fix this when dom types are updated
      let startViewTransitionParams: any

      if (
        typeof shouldViewTransition === 'object' &&
        window.CSS?.supports?.('selector(:active-view-transition-type(a))')
      ) {
        const next = this.latestLocation
        const prevLocation = this.stores.resolvedLocation.get()

        const resolvedViewTransitionTypes =
          typeof shouldViewTransition.types === 'function'
            ? shouldViewTransition.types(
                getLocationChangeInfo(next, prevLocation),
              )
            : shouldViewTransition.types

        if (resolvedViewTransitionTypes === false) {
          return fn()
        }

        startViewTransitionParams = {
          update: fn,
          types: resolvedViewTransitionTypes,
        }
      } else {
        startViewTransitionParams = fn
      }

      return (document as any).startViewTransition(startViewTransitionParams)
        .updateCallbackDone
    }
    return fn()
  }

  /**
   * Invalidate the current matches and optionally force them back into a pending state.
   *
   * - Marks all matches that pass the optional `filter` as `invalid: true`.
   *
   * The next load decides when to publish pending UI, so invalidation does not
   * mutate the currently rendered status.
   */
  invalidate: InvalidateFn<
    RouterCore<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >
  > = (opts) => {
    const committedMatches = this._committed
    const filter = opts?.filter
    const invalidIds = filter
      ? new Set(
          [...committedMatches, ...this._cache.values()]
            .filter((match) => filter(match as MakeRouteMatchUnion<this>))
            .map((match) => match.id),
        )
      : undefined
    const invalidate = (d: MakeRouteMatch<TRouteTree>) => {
      if (!invalidIds || invalidIds.has(d.id)) {
        const route = this.routesById[d.routeId] as AnyRoute
        const next = {
          ...d,
          invalid: true,
          ...((opts?.forcePending ||
            d.status === 'error' ||
            d.status === 'notFound') &&
          routeNeedsLoad(route)
            ? ({ status: 'pending', error: undefined } as const)
            : undefined),
        }
        // Invalidation replaces this owner; it does not create another lease.
        ;(d as AnyRouteMatch & { _flight?: LoaderFlight })._flight = undefined
        return next
      }
      return d
    }

    const committed = committedMatches.map(invalidate)
    this._committed = committed
    const cache = new Map<string, AnyRouteMatch>()
    for (const [id, match] of this._cache) {
      cache.set(id, invalidate(match))
    }
    this._cache = cache

    this.shouldViewTransition = false
    return this.load({ sync: opts?.sync })
  }

  resolveRedirect = (redirect: AnyRedirect): AnyRedirect => {
    const locationHeader = redirect.headers.get('Location')

    if (!redirect.options.href || redirect.options._builtLocation) {
      const location =
        redirect.options._builtLocation ?? this.buildLocation(redirect.options)
      const href = location.publicHref || '/'
      redirect.options.href = href
      redirect.headers.set('Location', href)
    } else if (locationHeader) {
      try {
        const url = new URL(locationHeader)
        if (this.origin && url.origin === this.origin) {
          const href = url.pathname + url.search + url.hash
          redirect.options.href = href
          redirect.headers.set('Location', href)
        }
      } catch {
        // ignore invalid URLs
      }
    }

    if (
      redirect.options.href &&
      !redirect.options._builtLocation &&
      // Check for dangerous protocols before processing the redirect
      isDangerousProtocol(redirect.options.href, this.protocolAllowlist)
    ) {
      throw new Error(
        process.env.NODE_ENV !== 'production'
          ? `Redirect blocked: unsafe protocol in href "${redirect.options.href}". Allowed protocols: ${Array.from(this.protocolAllowlist).join(', ')}.`
          : 'Redirect blocked: unsafe protocol',
      )
    }

    if (!redirect.headers.get('Location')) {
      redirect.headers.set('Location', redirect.options.href)
    }

    return redirect
  }

  clearCache: ClearCacheFn<this> = (opts) => {
    const cached = this._cache
    const preloads = this._preloads
    const filter = opts?.filter
    const retained = new Map<string, AnyRouteMatch>()
    const discarded: Array<AnyRouteMatch> = []
    for (const [id, match] of cached) {
      if (filter && !filter(match as MakeRouteMatchUnion<this>)) {
        retained.set(id, match)
      } else {
        discarded.push(match)
      }
    }
    const retainedPreloads = new Map<string, ActivePreload>()
    const discardedPreloads: Array<ActivePreload> = []
    for (const [href, preload] of preloads ?? []) {
      if (!filter || preload[0].some(filter as any)) {
        discardedPreloads.push(preload)
        discarded.push(...preload[0])
      } else {
        retainedPreloads.set(href, preload)
      }
    }

    // Install both replacement authorities before releasing a public loader
    // signal, whose abort listeners can synchronously reenter the router.
    this._cache = retained
    this._preloads = retainedPreloads
    transferMatchResources(this, discarded)
    for (const preload of discardedPreloads) {
      preload[1].abort()
    }
  }

  loadRouteChunk = loadRouteChunk

  preloadRoute: PreloadRouteFn<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory
  > = (opts) => preloadClientRoute(this, opts)

  matchRoute: MatchRouteFn<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory
  > = (location, opts) => {
    const matchLocation = {
      ...location,
      to: location.to
        ? this.resolvePathWithBase(location.from || '', location.to as string)
        : undefined,
      params: location.params || {},
      leaveParams: true,
    }
    const next = this.buildLocation(matchLocation as any)

    const isPending = this.stores.status.get() === 'pending'
    if (opts?.pending && !isPending) {
      return false
    }

    const pending = opts?.pending ?? !isPending

    const baseLocation = pending
      ? this.latestLocation
      : this.stores.resolvedLocation.get() || this.stores.location.get()

    const match = findSingleMatch(
      next.pathname,
      opts?.caseSensitive ?? false,
      opts?.fuzzy ?? false,
      baseLocation.pathname,
      this.processedTree,
    )

    if (!match) {
      return false
    }

    if (location.params) {
      if (!deepEqual(match.rawParams, location.params, { partial: true })) {
        return false
      }
    }

    if (opts?.includeSearch ?? true) {
      return deepEqual(baseLocation.search, next.search, { partial: true })
        ? match.rawParams
        : false
    }

    return match.rawParams
  }

  ssr?: {
    manifest: Manifest | undefined
  }

  serverSsr?: ServerSsr

  serverSsrLifecycle?: RouterSsrLifecycle
}

/**
 * In non-production environments,
 * augment the RouterCore class with a `_refreshRoute` method
 * dedicated to HMR.
 */
if (process.env.NODE_ENV !== 'production') {
  RouterCore.prototype._replaceRouteChunk = replaceRouteChunk
  RouterCore.prototype._refreshRoute = async function () {
    this._serverResult = undefined
    this.updateLatestLocation()
    await refreshClientRoute(this)
  }
}

/** Error thrown when search parameter validation fails. */
export class SearchParamError extends Error {}

/** Error thrown when path parameter parsing/validation fails. */
export class PathParamError extends Error {}

const normalize = (str: string) =>
  str.endsWith('/') && str.length > 1 ? str.slice(0, -1) : str
function comparePaths(a: string, b: string) {
  return normalize(a) === normalize(b)
}

/**
 * Lazily import a module function and forward arguments to it, retaining
 * parameter and return types for the selected export key.
 */
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

/** Create an initial RouterState from a parsed location. */
export function getInitialRouterState(
  location: ParsedLocation,
): RouterState<any> {
  return {
    isLoading: false,
    status: 'idle',
    resolvedLocation: undefined,
    location,
    matches: [],
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

function applySearchMiddleware(
  search: any,
  dest: BuildNextOptions,
  destRoutes: ReadonlyArray<AnyRoute>,
  includeValidateSearch: boolean | undefined,
) {
  const middlewares = [] as Array<SearchMiddleware<any>>

  for (const route of destRoutes) {
    const routeOptions = route.options
    if ('search' in routeOptions) {
      if (routeOptions.search?.middlewares) {
        middlewares.push(...routeOptions.search.middlewares)
      }
    }
    // TODO remove preSearchFilters and postSearchFilters in v2
    else if (routeOptions.preSearchFilters || routeOptions.postSearchFilters) {
      const legacyMiddleware: SearchMiddleware<any> = ({ search, next }) => {
        const nextSearch = routeOptions.preSearchFilters
          ? routeOptions.preSearchFilters.reduce(
              (prev, next) => next(prev),
              search,
            )
          : search

        const result = next(nextSearch)

        return routeOptions.postSearchFilters
          ? routeOptions.postSearchFilters.reduce(
              (prev, next) => next(prev),
              result,
            )
          : result
      }
      middlewares.push(legacyMiddleware)
    }

    const routeValidateSearch = routeOptions.validateSearch
    if (routeValidateSearch) {
      const validate: SearchMiddleware<any> = ({ search, next, meta }) => {
        const result = next(search)
        if (includeValidateSearch) {
          try {
            const validated = validateSearch(routeValidateSearch, result) as any

            if (meta && validated) {
              for (const key in validated) {
                if (!(key in result)) {
                  ;(meta.defaulted ||= new Map()).set(key, validated[key])
                }
              }
            }
            return { ...result, ...validated }
          } catch {
            // ignore errors here because they are already handled in matchRoutes
          }
        }
        return result
      }

      middlewares.push(validate)
    }
  }

  const applyNext = (
    index: number,
    currentSearch: any,
    meta?: SearchMiddlewareMeta,
  ): any => {
    // no more middlewares left, return the current search
    if (index >= middlewares.length) {
      if (!dest.search) {
        return {}
      }
      if (dest.search === true) {
        return currentSearch
      }
      const result = functionalUpdate(dest.search, currentSearch)
      if (meta) {
        meta.explicit = result
      }
      return result
    }

    const next = (newSearch: any, collectMeta?: true): any => {
      if (collectMeta) {
        const nextMeta = meta || ({} as SearchMiddlewareMeta)
        return {
          search: applyNext(index + 1, newSearch, nextMeta),
          meta: nextMeta,
        }
      }
      return applyNext(index + 1, newSearch, meta)
    }

    return (middlewares[index]! as any)({ search: currentSearch, next, meta })
  }

  return applyNext(0, search)
}

function findGlobalNotFoundRouteId(
  notFoundMode: 'root' | 'fuzzy' | undefined,
  routes: ReadonlyArray<AnyRoute>,
) {
  if (notFoundMode !== 'root') {
    let fallback
    for (let i = routes.length - 1; i >= 0; i--) {
      const route = routes[i]!
      if (route.options.notFoundComponent) {
        return route.id
      }
      fallback ||= route.children && route.id
    }
    if (fallback) {
      return fallback
    }
  }
  return rootRouteId
}

function resolveNextParams(
  spec: unknown,
  base: Record<string, unknown>,
): Record<string, unknown> {
  return spec === false || spec === null
    ? Object.create(null)
    : (spec ?? true) === true
      ? base
      : Object.assign(base, functionalUpdate(spec as any, base))
}

function extractStrictParams(
  route: AnyRoute,
  accumulatedParams: Record<string, unknown>,
) {
  const parseParams = route.options.params?.parse ?? route.options.parseParams
  if (parseParams) {
    Object.assign(
      accumulatedParams,
      parseParams(accumulatedParams as Record<string, string>),
    )
  }
}
