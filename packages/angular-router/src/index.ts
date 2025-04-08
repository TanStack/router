export { default as invariant } from 'tiny-invariant'
export { default as warning } from 'tiny-warning'

export {
  TSR_DEFERRED_PROMISE,
  cleanPath,
  createControlledPromise,
  decode,
  deepEqual,
  defaultParseSearch,
  defaultSerializeError,
  defaultStringifySearch,
  defer,
  encode,
  escapeJSON,
  functionalUpdate,
  interpolatePath,
  isMatch,
  isPlainArray,
  isPlainObject,
  joinPaths,
  matchByPath,
  matchPathname,
  parsePathname,
  parseSearchWith, // SSR
  pick,
  removeBasepath,
  replaceEqualDeep,
  resolvePath,
  retainSearchParams,
  rootRouteId,
  shallow,
  stringifySearchWith,
  stripSearchParams,
  trimPath,
  trimPathLeft,
  trimPathRight,
} from '@tanstack/router-core'

export type {
  AbsoluteToPath,
  ActiveOptions,
  AllContext,
  AllLoaderData,
  AllParams,
  AnyContext,
  AnyPathParams,
  AnyRedirect,
  AnyRoute,
  AnyRouteMatch,
  AnyRouteWithContext,
  AnyRouter,
  AnyRouterWithContext,
  AnySchema,
  AnyValidator,
  AnyValidatorAdapter,
  AnyValidatorFn,
  AnyValidatorObj,
  Assign,
  BaseRouteOptions,
  BeforeLoadContextOptions,
  BeforeLoadContextParameter,
  BeforeLoadFn,
  BuildLocationFn,
  BuildNextOptions,
  CommitLocationOptions,
  Constrain,
  ContextAsyncReturnType,
  ContextOptions,
  ContextReturnType,
  ControllablePromise,
  ControlledPromise,
  DefaultValidator,
  DeferredPromise,
  DeferredPromiseState,
  ErrorComponentProps,
  ErrorRouteProps,
  Expand,
  ExtractedEntry,
  ExtractedPromise,
  ExtractedStream,
  FileBaseRouteOptions,
  FileRouteTypes,
  FileRoutesByPath,
  FullSearchSchema,
  FullSearchSchemaInput,
  FullSearchSchemaOption,
  InferAllContext,
  InferAllParams,
  InferDescendantToPaths,
  InferFullSearchSchema,
  InferFullSearchSchemaInput,
  InjectedHtmlEntry,
  IntersectAssign,
  LazyRouteOptions,
  LinkOptions,
  ListenerFn,
  LoaderFnContext,
  LooseAsyncReturnType,
  LooseReturnType,
  MakeOptionalPathParams,
  MakeRemountDepsOptionsUnion,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  Manifest,
  MatchLocation,
  MergeAll,
  MetaDescriptor,
  NavigateFn,
  NavigateOptions,
  NotFoundRouteProps,
  ParamsOptions,
  ParseParamsFn,
  ParsePathParams,
  ParseRoute,
  ParseSplatParams,
  ParsedLocation,
  PathParamOptions,
  PreloadableObj,
  Redirect,
  Register,
  RegisteredRouter,
  RelativeToCurrentPath,
  RelativeToParentPath,
  RelativeToPath,
  RelativeToPathAutoComplete,
  RemountDepsOptions,
  RemoveLeadingSlashes,
  RemoveTrailingSlashes,
  ResolveAllContext,
  ResolveAllParamsFromParent,
  ResolveFullPath,
  ResolveFullSearchSchema,
  ResolveFullSearchSchemaInput,
  ResolveId,
  ResolveLoaderData,
  ResolveParams,
  ResolveRelativePath,
  ResolveRoute,
  ResolveRouteContext,
  ResolveSearchValidatorInput,
  ResolveSearchValidatorInputFn,
  ResolveValidatorInput,
  ResolveValidatorInputFn,
  ResolveValidatorOutput,
  ResolveValidatorOutputFn,
  ResolvedRedirect,
  RootRouteId,
  RootRouteOptions,
  RouteById,
  RouteByPath,
  RouteConstraints,
  RouteContext,
  RouteContextFn,
  RouteContextOptions,
  RouteContextParameter,
  RouteIds,
  RouteLinkEntry,
  RouteLoaderFn,
  RouteMask,
  RouteOptions,
  RoutePathOptions,
  RoutePathOptionsIntersection,
  RoutePaths,
  RouterConstructorOptions,
  RouterContextOptions,
  RouterErrorSerializer,
  RouterEvent,
  RouterEvents,
  RouterListener,
  RouterManagedTag,
  RouterOptions,
  RouterState,
  RoutesById,
  RoutesByPath,
  SearchFilter,
  SearchParamOptions,
  SearchParser,
  SearchSchemaInput,
  SearchSerializer,
  Segment,
  Serializable,
  SerializerParse,
  SerializerParseBy,
  SerializerStringify,
  SerializerStringifyBy,
  SplatParams,
  StartSerializer,
  StaticDataRouteOption,
  StreamState,
  StringifyParamsFn,
  MatchRouteOptions as TanstackMatchRouteOptions,
  RouteMatch as TanstackRouteMatch,
  ToMaskOptions,
  ToOptions,
  ToPathOption,
  ToSubOptions,
  TrailingSlashOption,
  TrimPath,
  TrimPathLeft,
  TrimPathRight,
  UpdatableRouteOptions,
  UpdatableStaticRouteOption,
  UseNavigateResult,
  Validator,
  ValidatorAdapter,
  ValidatorFn,
  ValidatorObj,
} from '@tanstack/router-core'

export {
  createBrowserHistory,
  createHashHistory,
  createHistory,
  createMemoryHistory,
} from '@tanstack/history'

export type {
  BlockerFn,
  HistoryLocation,
  HistoryState,
  ParsedPath,
  RouterHistory,
} from '@tanstack/history'

export { Link, linkOptions } from './link'
export { MatchRoute, matchRoute, matchRoute$ } from './match-route'
export type { MakeMatchRouteOptions, MatchRouteOptions } from './match-route'
export {
  Matches,
  childMatches,
  childMatches$,
  matches,
  matches$,
  parentMatches,
  parentMatches$,
} from './matches'

export { OnRendered, Outlet, RouteMatch } from './outlet'

export { loaderData, loaderData$ } from './loader-data'
export { loaderDeps, loaderDeps$ } from './loader-deps'
export { match, match$ } from './match'

export { isRedirect, redirect } from '@tanstack/router-core'

export {
  LazyRoute,
  createFileRoute,
  createLazyFileRoute,
  createLazyRoute,
} from './file-route'
export {
  ERROR_COMPONENT_CONTEXT,
  NOT_FOUND_COMPONENT_CONTEXT,
  NotFoundRoute,
  RootRoute,
  Route,
  RouteApi,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  routeApi,
} from './route'

export type { AnyRootRoute, RouteComponent } from './route'

export {
  NgRouter,
  ROUTER,
  ROUTER_STATE,
  createRouter,
  injectRouter,
  injectRouterState,
  provideRouter,
} from './router'
export * from './router-root'

export {
  PathParamError,
  SearchParamError,
  componentTypes,
  getInitialRouterState,
  lazyFn,
} from '@tanstack/router-core'

export { params, params$ } from './params'
export { search, search$ } from './search'

export { canGoBack, canGoBack$ } from './can-go-back'
export { location, location$ } from './location'
export { routeContext, routeContext$ } from './route-context'
export { routerState, routerState$ } from './router-state'

export { isNotFound, notFound } from '@tanstack/router-core'
export type { NotFoundError } from '@tanstack/router-core'
export { DefaultError } from './default-error'
export { DefaultNotFound } from './default-not-found'

export type { ValidateLinkOptions, ValidateLinkOptionsArray } from './link'

export type {
  InferFrom,
  InferMaskFrom,
  InferMaskTo,
  InferSelected,
  InferShouldThrow,
  InferStrict,
  InferTo,
  ValidateFromPath,
  ValidateId,
  ValidateNavigateOptions,
  ValidateNavigateOptionsArray,
  ValidateParams,
  ValidateRedirectOptions,
  ValidateRedirectOptionsArray,
  ValidateSearch,
  ValidateToPath,
  ValidateUseParamsResult,
  ValidateUseSearchResult,
} from '@tanstack/router-core'

export * from './transitioner'
export * from './is-dev-mode'
