export { default as invariant } from 'tiny-invariant'
export { default as warning } from 'tiny-warning'

export {
  defer,
  TSR_DEFERRED_PROMISE,
  isMatch,
  joinPaths,
  cleanPath,
  trimPathLeft,
  trimPathRight,
  trimPath,
  resolvePath,
  parsePathname,
  interpolatePath,
  matchPathname,
  removeBasepath,
  matchByPath,
  encode,
  decode,
  rootRouteId,
  defaultSerializeError,
  defaultParseSearch,
  defaultStringifySearch,
  parseSearchWith,
  stringifySearchWith,
  escapeJSON, // SSR
  pick,
  functionalUpdate,
  replaceEqualDeep,
  isPlainObject,
  isPlainArray,
  deepEqual,
  shallow,
  createControlledPromise,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/router-core'

export type {
  StartSerializer,
  Serializable,
  SerializerParse,
  SerializerParseBy,
  SerializerStringify,
  SerializerStringifyBy,
  DeferredPromiseState,
  DeferredPromise,
  ParsedLocation,
  ParsePathParams,
  RemoveTrailingSlashes,
  RemoveLeadingSlashes,
  ActiveOptions,
  Segment,
  ResolveRelativePath,
  RootRouteId,
  AnyPathParams,
  ResolveParams,
  SearchSchemaInput,
  AnyContext,
  RouteContext,
  PreloadableObj,
  RoutePathOptions,
  StaticDataRouteOption,
  RoutePathOptionsIntersection,
  UpdatableStaticRouteOption,
  MetaDescriptor,
  RouteLinkEntry,
  ParseParamsFn,
  SearchFilter,
  ResolveId,
  InferFullSearchSchema,
  InferFullSearchSchemaInput,
  ErrorRouteProps,
  ErrorComponentProps,
  NotFoundRouteProps,
  TrimPath,
  TrimPathLeft,
  TrimPathRight,
  ParseSplatParams,
  SplatParams,
  StringifyParamsFn,
  ParamsOptions,
  InferAllParams,
  InferAllContext,
  LooseReturnType,
  LooseAsyncReturnType,
  ContextReturnType,
  ContextAsyncReturnType,
  ResolveLoaderData,
  ResolveRouteContext,
  SearchSerializer,
  SearchParser,
  TrailingSlashOption,
  ExtractedEntry,
  ExtractedStream,
  ExtractedPromise,
  StreamState,
  Manifest,
  RouterManagedTag,
  ControlledPromise,
  Constrain,
  Expand,
  MergeAll,
  Assign,
  IntersectAssign,
  ResolveValidatorInput,
  ResolveValidatorOutput,
  AnyValidator,
  DefaultValidator,
  ValidatorFn,
  AnySchema,
  AnyValidatorAdapter,
  AnyValidatorFn,
  AnyValidatorObj,
  ResolveValidatorInputFn,
  ResolveValidatorOutputFn,
  ResolveSearchValidatorInput,
  ResolveSearchValidatorInputFn,
  Validator,
  ValidatorAdapter,
  ValidatorObj,
} from '@tanstack/router-core'

export {
  createHistory,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
} from '@tanstack/history'

export type {
  BlockerFn,
  HistoryLocation,
  RouterHistory,
  ParsedPath,
  HistoryState,
} from '@tanstack/history'

export { useAwaited, Await } from './awaited'
export type { AwaitOptions } from './awaited'

export { CatchBoundary, ErrorComponent } from './CatchBoundary'

export {
  FileRoute,
  createFileRoute,
  FileRouteLoader,
  LazyRoute,
  createLazyRoute,
  createLazyFileRoute,
} from './fileRoute'
export type {
  FileRoutesByPath,
  FileRouteTypes,
  LazyRouteOptions,
} from './fileRoute'

export * from './history'

export { lazyRouteComponent } from './lazyRouteComponent'

export { useLinkProps, createLink, Link, linkOptions } from './link'
export type {
  InferDescendantToPaths,
  RelativeToPath,
  RelativeToParentPath,
  RelativeToCurrentPath,
  AbsoluteToPath,
  RelativeToPathAutoComplete,
  NavigateOptions,
  ToOptions,
  ToMaskOptions,
  ToSubOptions,
  ResolveRoute,
  SearchParamOptions,
  PathParamOptions,
  ToPathOption,
  LinkOptions,
  UseLinkPropsOptions,
  ActiveLinkOptions,
  LinkProps,
  LinkComponent,
  LinkComponentProps,
  CreateLinkProps,
  MakeOptionalPathParams,
} from './link'

export {
  Matches,
  useMatchRoute,
  MatchRoute,
  useMatches,
  useParentMatches,
  useChildMatches,
} from './Matches'

export type {
  RouteMatch,
  AnyRouteMatch,
  MatchRouteOptions,
  UseMatchRouteOptions,
  MakeMatchRouteOptions,
  MakeRouteMatch,
  MakeRouteMatchUnion,
} from './Matches'

export { matchContext } from './matchContext'
export { Match, Outlet } from './Match'

export { useMatch } from './useMatch'
export { useLoaderDeps } from './useLoaderDeps'
export { useLoaderData } from './useLoaderData'

export { redirect, isRedirect } from './redirects'
export type { AnyRedirect, Redirect, ResolvedRedirect } from './redirects'

export {
  RouteApi,
  getRouteApi,
  Route,
  createRoute,
  RootRoute,
  rootRouteWithContext,
  createRootRoute,
  createRootRouteWithContext,
  createRouteMask,
  NotFoundRoute,
} from './route'
export type {
  RouteOptions,
  FileBaseRouteOptions,
  BaseRouteOptions,
  UpdatableRouteOptions,
  RouteLoaderFn,
  LoaderFnContext,
  ResolveFullSearchSchema,
  ResolveFullSearchSchemaInput,
  AnyRoute,
  RouteConstraints,
  AnyRootRoute,
  ResolveFullPath,
  RouteMask,
  ReactNode,
  SyncRouteComponent,
  AsyncRouteComponent,
  RouteComponent,
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RootRouteOptions,
  AnyRouteWithContext,
  FullSearchSchemaOption,
  RouteContextFn,
  RouteContextOptions,
  BeforeLoadFn,
  BeforeLoadContextOptions,
  ContextOptions,
  RouteContextParameter,
  BeforeLoadContextParameter,
  ResolveAllContext,
  ResolveAllParamsFromParent,
} from './route'

export type {
  ParseRoute,
  RoutesById,
  RouteById,
  RouteIds,
  RoutesByPath,
  RouteByPath,
  RoutePaths,
  FullSearchSchema,
  AllParams,
  AllLoaderData,
  FullSearchSchemaInput,
  AllContext,
} from './routeInfo'

export {
  componentTypes,
  createRouter,
  Router,
  lazyFn,
  SearchParamError,
  PathParamError,
  getInitialRouterState,
} from './router'

export type {
  Register,
  AnyRouter,
  RegisteredRouter,
  RouterContextOptions,
  RouterOptions,
  RouterErrorSerializer,
  RouterState,
  ListenerFn,
  BuildNextOptions,
  RouterConstructorOptions,
  RouterEvents,
  RouterEvent,
  RouterListener,
  AnyRouterWithContext,
  ControllablePromise,
  InjectedHtmlEntry,
} from './router'

export { RouterProvider, RouterContextProvider } from './RouterProvider'
export type {
  RouterProps,
  CommitLocationOptions,
  MatchLocation,
  NavigateFn,
  BuildLocationFn,
} from './RouterProvider'

export {
  useScrollRestoration,
  useElementScrollRestoration,
  ScrollRestoration,
} from './scroll-restoration'
export type { ScrollRestorationOptions } from './scroll-restoration'

export type { UseBlockerOpts, ShouldBlockFn } from './useBlocker'
export { useBlocker, Block } from './useBlocker'

export { useNavigate, Navigate } from './useNavigate'
export type { UseNavigateResult } from './useNavigate'

export { useParams } from './useParams'
export { useSearch } from './useSearch'

export {
  getRouterContext, // SSR
} from './routerContext'

export { useRouteContext } from './useRouteContext'
export { useRouter } from './useRouter'
export { useRouterState } from './useRouterState'
export { useLocation } from './useLocation'
export { useCanGoBack } from './useCanGoBack'

export {
  useLayoutEffect, // SSR
  useStableCallback,
} from './utils'

export {
  notFound,
  isNotFound,
  CatchNotFound,
  DefaultGlobalNotFound,
} from './not-found'
export type { NotFoundError } from './not-found'

export * from './typePrimitives'

export { ScriptOnce } from './ScriptOnce'
