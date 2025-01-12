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
export { default as invariant } from 'tiny-invariant'
export { default as warning } from 'tiny-warning'

export { useAwaited, Await } from './awaited'
export type { AwaitOptions } from './awaited'

export { ScriptOnce } from './ScriptOnce'

export { defer, TSR_DEFERRED_PROMISE } from './defer'
export type { DeferredPromiseState, DeferredPromise } from './defer'

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
  ParsePathParams,
  RemoveTrailingSlashes,
  RemoveLeadingSlashes,
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
  ActiveOptions,
  LinkOptions,
  ResolveRelativePath,
  UseLinkPropsOptions,
  ActiveLinkOptions,
  LinkProps,
  LinkComponent,
  LinkComponentProps,
  CreateLinkProps,
  MakeOptionalPathParams,
} from './link'

export type { ParsedLocation } from './location'

export {
  Matches,
  useMatchRoute,
  MatchRoute,
  useMatches,
  useParentMatches,
  useChildMatches,
  isMatch,
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

export { isServerSideError, defaultDeserializeError } from './isServerSideError'

export { useMatch } from './useMatch'

export { useLoaderDeps } from './useLoaderDeps'

export { useLoaderData } from './useLoaderData'

export {
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
} from './path'
export type { Segment } from './path'

export { encode, decode } from './qss'

export { redirect, isRedirect } from './redirects'
export type { AnyRedirect, Redirect, ResolvedRedirect } from './redirects'

export { rootRouteId } from './root'
export type { RootRouteId } from './root'

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
  AnyPathParams,
  ResolveParams,
  SearchSchemaInput,
  AnyContext,
  RouteContext,
  PreloadableObj,
  RoutePathOptions,
  StaticDataRouteOption,
  RoutePathOptionsIntersection,
  RouteOptions,
  FileBaseRouteOptions,
  BaseRouteOptions,
  UpdatableRouteOptions,
  UpdatableStaticRouteOption,
  MetaDescriptor,
  RouteLinkEntry,
  ParseParamsFn,
  RouteLoaderFn,
  LoaderFnContext,
  SearchFilter,
  ResolveId,
  InferFullSearchSchema,
  InferFullSearchSchemaInput,
  ResolveFullSearchSchema,
  ResolveFullSearchSchemaInput,
  AnyRoute,
  RouteConstraints,
  AnyRootRoute,
  ResolveFullPath,
  RouteMask,
  ErrorRouteProps,
  ErrorComponentProps,
  NotFoundRouteProps,
  ReactNode,
  SyncRouteComponent,
  AsyncRouteComponent,
  RouteComponent,
  ErrorRouteComponent,
  NotFoundRouteComponent,
  TrimPath,
  TrimPathLeft,
  TrimPathRight,
  RootRouteOptions,
  AnyRouteWithContext,
  ParseSplatParams,
  SplatParams,
  StringifyParamsFn,
  ParamsOptions,
  FullSearchSchemaOption,
  RouteContextFn,
  RouteContextOptions,
  BeforeLoadFn,
  BeforeLoadContextOptions,
  ContextOptions,
  InferAllParams,
  InferAllContext,
  LooseReturnType,
  LooseAsyncReturnType,
  ContextReturnType,
  ContextAsyncReturnType,
  RouteContextParameter,
  BeforeLoadContextParameter,
  ResolveAllContext,
  ResolveLoaderData,
  ResolveAllParamsFromParent,
  ResolveRouteContext,
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
  defaultSerializeError,
} from './router'
export type {
  Register,
  AnyRouter,
  RegisteredRouter,
  HydrationCtx,
  RouterContextOptions,
  TrailingSlashOption,
  RouterOptions,
  RouterErrorSerializer,
  RouterState,
  ListenerFn,
  BuildNextOptions,
  DehydratedRouterState,
  DehydratedRouteMatch,
  DehydratedRouter,
  RouterConstructorOptions,
  RouterEvents,
  RouterEvent,
  RouterListener,
  AnyRouterWithContext,
  ExtractedEntry,
  ExtractedStream,
  ExtractedPromise,
  StreamState,
} from './router'

export { RouterProvider, RouterContextProvider } from './RouterProvider'
export type {
  RouterProps,
  CommitLocationOptions,
  MatchLocation,
  NavigateFn,
  BuildLocationFn,
  InjectedHtmlEntry,
} from './RouterProvider'

export {
  useScrollRestoration,
  useElementScrollRestoration,
  ScrollRestoration,
} from './scroll-restoration'
export type { ScrollRestorationOptions } from './scroll-restoration'

export {
  defaultParseSearch,
  defaultStringifySearch,
  parseSearchWith,
  stringifySearchWith,
} from './searchParams'
export type { SearchSerializer, SearchParser } from './searchParams'

export { defaultTransformer } from './transformer'
export type {
  RouterTransformer,
  TransformerParse,
  TransformerStringify,
  DefaultSerializable,
  DefaultTransformerParse,
  DefaultTransformerStringify,
} from './transformer'

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
  escapeJSON, // SSR
  useLayoutEffect, // SSR
  pick,
  functionalUpdate,
  replaceEqualDeep,
  isPlainObject,
  isPlainArray,
  deepEqual,
  useStableCallback,
  shallow,
} from './utils'

export {
  notFound,
  isNotFound,
  CatchNotFound,
  DefaultGlobalNotFound,
} from './not-found'
export type { NotFoundError } from './not-found'

export type { Manifest, RouterManagedTag } from './manifest'

export { createControlledPromise } from './utils'
export type {
  ControlledPromise,
  Constrain,
  Expand,
  MergeAll,
  Assign,
} from './utils'

export type {
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
} from './validators'

export { retainSearchParams, stripSearchParams } from './searchMiddleware'

export * from './typePrimitives'
