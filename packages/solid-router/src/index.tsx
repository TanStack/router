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

export { ScriptOnce } from './ScriptOnce'

export { defer, TSR_DEFERRED_PROMISE } from '@tanstack/router-core'
export type {
  DeferredPromiseState,
  DeferredPromise,
} from '@tanstack/router-core'

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

export * from '@tanstack/router-core'

export { lazyRouteComponent } from './lazyRouteComponent'

export { useLinkProps, createLink, Link, linkOptions } from './link'
export type {
  SearchPaths,
  SearchRelativePathAutoComplete,
  RelativeToParentPathAutoComplete,
  RelativeToCurrentPathAutoComplete,
  AbsolutePathAutoComplete,
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
export type {
  ParsePathParams,
  RemoveTrailingSlashes,
  RemoveLeadingSlashes,
} from '@tanstack/router-core'
export type { ActiveOptions, ResolveRelativePath } from '@tanstack/router-core'

export type { ParsedLocation } from '@tanstack/router-core'

export {
  Matches,
  useMatchRoute,
  MatchRoute,
  useMatches,
  useParentMatches,
  useChildMatches,
} from './Matches'
export { isMatch } from '@tanstack/router-core'
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

export {
  isServerSideError,
  defaultDeserializeError,
} from '@tanstack/router-core'

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
} from '@tanstack/router-core'
export type { Segment } from '@tanstack/router-core'

export { encode, decode } from '@tanstack/router-core'

export { redirect, isRedirect } from './redirects'
export type { AnyRedirect, Redirect, ResolvedRedirect } from './redirects'

export { rootRouteId } from '@tanstack/router-core'
export type { RootRouteId } from '@tanstack/router-core'

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
export type { ParseRoute } from '@tanstack/router-core'

export {
  componentTypes,
  createRouter,
  Router,
  lazyFn,
  SearchParamError,
  PathParamError,
  getInitialRouterState,
} from './router'
export { defaultSerializeError } from '@tanstack/router-core'
export type {
  Register,
  AnyRouter,
  RegisteredRouter,
  HydrationCtx,
  RouterContextOptions,
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
} from './router'
export type {
  ExtractedEntry,
  ExtractedStream,
  ExtractedPromise,
  StreamState,
  TrailingSlashOption,
} from '@tanstack/router-core'

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
} from '@tanstack/router-core'
export type { SearchSerializer, SearchParser } from '@tanstack/router-core'

export { defaultTransformer } from '@tanstack/router-core'
export type {
  RouterTransformer,
  TransformerParse,
  TransformerStringify,
  DefaultTransformerParse,
  DefaultTransformerStringify,
} from '@tanstack/router-core'

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

export {
  escapeJSON, // SSR
  // useLayoutEffect, // SSR
  pick,
  functionalUpdate,
  replaceEqualDeep,
  isPlainObject,
  isPlainArray,
  deepEqual,
  shallow,
} from '@tanstack/router-core'

export {
  notFound,
  isNotFound,
  CatchNotFound,
  DefaultGlobalNotFound,
} from './not-found'
export type { NotFoundError } from './not-found'

export type { Manifest, RouterManagedTag } from '@tanstack/router-core'

export { createControlledPromise } from '@tanstack/router-core'
export type {
  ControlledPromise,
  Constrain,
  Expand,
  MergeAll,
  Assign,
} from '@tanstack/router-core'

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
} from '@tanstack/router-core'

export { retainSearchParams, stripSearchParams } from '@tanstack/router-core'

export * from './typePrimitives'
