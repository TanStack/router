// History
export { createNativeHistory } from './history'
export type { NativeHistoryOptions, NativeRouterHistory } from './history'

// Router (framework-specific)
export { createRouter, Router } from './router'

// Routes (framework-specific)
export {
  Route,
  RootRoute,
  RouteApi,
  getRouteApi,
  createRoute,
  createRootRoute,
  createRouteMask,
} from './route'
export type {
  RouteComponent,
  ErrorRouteComponent,
  NotFoundRouteComponent,
} from './route'

// Provider
export { NativeRouterProvider, RouterContextProvider } from './NativeRouterProvider'
export type { NativeRouterProviderProps } from './NativeRouterProvider'

// Components
export { Link, useNativeLinkProps } from './Link'
export type { NativeLinkProps, ActiveLinkOptions } from './Link'

export { Match, MatchInner, Outlet } from './Match'
export { Matches, NativeScreenMatches } from './Matches'
export { CatchBoundary, ErrorComponent } from './CatchBoundary'
export type { ErrorComponentProps } from './CatchBoundary'
export { SafeFragment } from './SafeFragment'

// Hooks
export { useRouter } from './useRouter'
export { useRouterState } from './useRouterState'
export type { UseRouterStateOptions, UseRouterStateResult } from './useRouterState'

export { useMatch } from './useMatch'
export type {
  UseMatchBaseOptions,
  UseMatchOptions,
  UseMatchResult,
  UseMatchRoute,
} from './useMatch'

export { useNavigate, Navigate } from './useNavigate'

export { useParams } from './useParams'
export type {
  UseParamsBaseOptions,
  UseParamsOptions,
  UseParamsRoute,
} from './useParams'

export { useSearch } from './useSearch'
export type {
  UseSearchBaseOptions,
  UseSearchOptions,
  UseSearchRoute,
} from './useSearch'

export { useLoaderData } from './useLoaderData'
export type {
  UseLoaderDataBaseOptions,
  UseLoaderDataOptions,
  UseLoaderDataRoute,
} from './useLoaderData'

// Context
export { getRouterContext } from './routerContext'
export { matchContext, dummyMatchContext } from './matchContext'

// Types
export type {
  StructuralSharingOption,
  ValidateSelected,
  DefaultStructuralSharingEnabled,
  StructuralSharingEnabled,
} from './structuralSharing'

// Re-export platform-agnostic items from router-core
export {
  // Router base class
  RouterCore,
  // Route base classes
  BaseRoute,
  BaseRootRoute,
  BaseRouteApi,
  // Route constants
  rootRouteId,
  // Redirect
  redirect,
  isRedirect,
  // Not Found
  notFound,
  isNotFound,
  // Utilities
  deepEqual,
  functionalUpdate,
  replaceEqualDeep,
} from '@tanstack/router-core'

// Re-export types from router-core
export type {
  // Route types
  AnyRoute,
  AnyRouteWithContext,
  RouteOptions,
  RootRouteOptions,
  RouteMask,
  RouteConstraints,
  Route as RouteCore,
  RootRoute as RootRouteCore,
  // Router types
  AnyRouter,
  RouterOptions,
  RegisteredRouter,
  RouterState,
  RouterEvents,
  RouterConstructorOptions,
  CreateRouterFn,
  TrailingSlashOption,
  // Navigation types
  NavigateOptions,
  ToOptions,
  LinkOptions,
  ResolveRelativePath,
  UseNavigateResult,
  FromPathOption,
  ToMaskOptions,
  // Match types
  AnyRouteMatch,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  MatchRouteOptions,
  // Params/Search types
  ResolveUseParams,
  ResolveUseSearch,
  ResolveUseLoaderData,
  UseParamsResult,
  UseSearchResult,
  UseLoaderDataResult,
  FullSearchSchema,
  ResolveParams,
  ResolveFullPath,
  ResolveId,
  // Path types
  RoutePaths,
  RouteById,
  RoutesById,
  RoutesByPath,
  RouteIds,
  RouteTypesById,
  // Utility types
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  ParsedLocation,
  AnyContext,
  ConstrainLiteral,
  // Redirect types
  AnyRedirect,
  Redirect,
  // Not Found types
  NotFoundError,
  NotFoundRouteProps,
  // Error types
  ErrorComponentProps as CoreErrorComponentProps,
  // Validator types
  AnySchema,
  AnyValidator,
} from '@tanstack/router-core'

// Re-export history types
export type {
  RouterHistory,
  HistoryLocation,
  ParsedHistoryState,
  NavigateOptions as HistoryNavigateOptions,
  HistoryAction,
  BlockerFn,
  BlockerFnArgs,
  NavigationBlocker,
} from '@tanstack/history'

export { createMemoryHistory, parseHref } from '@tanstack/history'
