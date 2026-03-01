// Router
export { createRouter, Router } from './router'

// Route creation
export {
  createRoute,
  createRootRoute,
  createRootRouteWithContext,
  createRouteMask,
  getRouteApi,
  Route,
  RootRoute,
  NotFoundRoute,
  RouteApi,
  type AnyRootRoute,
  type RouteComponent,
  type ErrorRouteComponent,
  type NotFoundRouteComponent,
} from './route'

export {
  createFileRoute,
  LazyRoute,
  createLazyRoute,
  createLazyFileRoute,
} from './fileRoute'

// Router Provider
export { RouterProvider } from './RouterProvider'

// Components
export { Outlet, RouteMatch } from './Match'
export { Matches } from './Matches'

// Injection functions
export { injectRouter, type InjectRouterResult } from './injectRouter'

export {
  injectRouterState,
  type InjectRouterStateOptions,
  type InjectRouterStateResult,
} from './injectRouterState'

export { injectNavigate, type InjectNavigateResult } from './injectNavigate'

export {
  injectMatch,
  type InjectMatchOptions,
  type InjectMatchResult,
  type InjectMatchRoute,
  type InjectMatchBaseOptions,
} from './injectMatch'

export {
  injectParams,
  type InjectParamsOptions,
  type InjectParamsRoute,
  type InjectParamsBaseOptions,
} from './injectParams'

export {
  injectSearch,
  type InjectSearchOptions,
  type InjectSearchRoute,
  type InjectSearchBaseOptions,
} from './injectSearch'

export {
  injectLoaderData,
  type InjectLoaderDataOptions,
  type InjectLoaderDataRoute,
  type InjectLoaderDataBaseOptions,
} from './injectLoaderData'

export {
  injectLoaderDeps,
  type InjectLoaderDepsOptions,
  type InjectLoaderDepsRoute,
  type InjectLoaderDepsBaseOptions,
} from './injectLoaderDeps'

export {
  injectRouterContext,
  type InjectRouteContextRoute,
} from './injectRouteContext'

export {
  injectLocation,
  type InjectLocationOptions,
  type InjectLocationResult,
} from './injectLocationResult'

export {
  injectBlocker,
  type InjectBlockerOpts,
  type UseBlockerOpts,
  type ShouldBlockFn,
} from './injectBlocker'

export { injectCanGoBack } from './injectCanGoBack'

export { injectErrorState } from './injectErrorState'

// Link
export { type LinkOptions as LinkInputOptions, Link } from './Link'

// Core re-exports
export {
  notFound,
  redirect,
  isRedirect,
  retainSearchParams,
  createRouterConfig,
} from '@tanstack/router-core'

// History utilities
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

// Re-export types from router-core that are commonly used
export type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
  LinkOptions,
  NavigateOptions,
  RouteOptions,
  RootRouteOptions,
  Register,
  RouterContextOptions,
} from '@tanstack/router-core'
