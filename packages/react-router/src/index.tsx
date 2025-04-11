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
  AnyRoute,
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
  Register,
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
  FileRoutesByPath,
  RouteById,
  RootRouteOptions,
  SerializerExtensions,
} from '@tanstack/router-core'

export type * from './serializer'

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
export { ClientOnly } from './ClientOnly'

export {
  FileRoute,
  createFileRoute,
  FileRouteLoader,
  LazyRoute,
  createLazyRoute,
  createLazyFileRoute,
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
  MakeOptionalPathParams,
  FileRouteTypes,
  RouteContextParameter,
  BeforeLoadContextParameter,
  ResolveAllContext,
  ResolveAllParamsFromParent,
  ResolveFullSearchSchema,
  ResolveFullSearchSchemaInput,
  RouteIds,
  NavigateFn,
  BuildLocationFn,
  FullSearchSchemaOption,
  MakeRemountDepsOptionsUnion,
  RemountDepsOptions,
  ResolveFullPath,
  AnyRouteWithContext,
  AnyRouterWithContext,
  CommitLocationOptions,
  MatchLocation,
  UseNavigateResult,
  AnyRedirect,
  Redirect,
  ResolvedRedirect,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RouteMatch,
  AnyRouteMatch,
  RouteContextFn,
  RouteContextOptions,
  BeforeLoadFn,
  BeforeLoadContextOptions,
  ContextOptions,
  RouteOptions,
  FileBaseRouteOptions,
  BaseRouteOptions,
  UpdatableRouteOptions,
  RouteLoaderFn,
  LoaderFnContext,
  LazyRouteOptions,
  AnyRouter,
  RegisteredRouter,
  RouterContextOptions,
  ControllablePromise,
  InjectedHtmlEntry,
  RouterOptions,
  RouterErrorSerializer,
  RouterState,
  ListenerFn,
  BuildNextOptions,
  RouterConstructorOptions,
  RouterEvents,
  RouterEvent,
  RouterListener,
  RouteConstraints,
  RouteMask,
  MatchRouteOptions,
} from '@tanstack/router-core'
export type {
  UseLinkPropsOptions,
  ActiveLinkOptions,
  LinkProps,
  LinkComponent,
  LinkComponentProps,
  CreateLinkProps,
} from './link'

export {
  Matches,
  useMatchRoute,
  MatchRoute,
  useMatches,
  useParentMatches,
  useChildMatches,
} from './Matches'

export type { UseMatchRouteOptions, MakeMatchRouteOptions } from './Matches'

export { matchContext } from './matchContext'
export { Match, Outlet } from './Match'

export { useMatch } from './useMatch'
export { useLoaderDeps } from './useLoaderDeps'
export { useLoaderData } from './useLoaderData'

export { redirect, isRedirect } from '@tanstack/router-core'

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
  AnyRootRoute,
  ReactNode,
  SyncRouteComponent,
  AsyncRouteComponent,
  RouteComponent,
  ErrorRouteComponent,
  NotFoundRouteComponent,
} from './route'

export { createRouter, Router } from './router'

export {
  componentTypes,
  lazyFn,
  SearchParamError,
  PathParamError,
  getInitialRouterState,
} from '@tanstack/router-core'

export { RouterProvider, RouterContextProvider } from './RouterProvider'
export type { RouterProps } from './RouterProvider'

export {
  useElementScrollRestoration,
  ScrollRestoration,
} from './ScrollRestoration'

export type { UseBlockerOpts, ShouldBlockFn } from './useBlocker'
export { useBlocker, Block } from './useBlocker'

export { useNavigate, Navigate } from './useNavigate'

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

export { CatchNotFound, DefaultGlobalNotFound } from './not-found'
export { notFound, isNotFound } from '@tanstack/router-core'
export type { NotFoundError } from '@tanstack/router-core'

export type {
  ValidateLinkOptions,
  InferStructuralSharing,
  ValidateUseSearchOptions,
  ValidateUseParamsOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

export type {
  ValidateFromPath,
  ValidateToPath,
  ValidateSearch,
  ValidateParams,
  InferFrom,
  InferTo,
  InferMaskTo,
  InferMaskFrom,
  ValidateNavigateOptions,
  ValidateNavigateOptionsArray,
  ValidateRedirectOptions,
  ValidateRedirectOptionsArray,
  ValidateId,
  InferStrict,
  InferShouldThrow,
  InferSelected,
  ValidateUseSearchResult,
  ValidateUseParamsResult,
} from '@tanstack/router-core'

export { ScriptOnce } from './ScriptOnce'
export { Asset } from './Asset'
export { HeadContent } from './HeadContent'
export { Scripts } from './Scripts'
