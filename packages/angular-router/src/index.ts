// Router
export { createRouter } from './router'

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

export { createLazyRoute } from './fileRoute'

// Router Provider
export { RouterProvider } from './RouterProvider'

// Components
export { Outlet, RouteMatch } from './Match'
export { Matches } from './Macthes'

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

// Link
export {
  type LinkOptions as LinkInputOptions,
  Link as RouterLink,
} from './Link'

// Utilities
export { injectIntersectionObserver } from './injectIntersectionObserver'
export { injectDynamicRenderer } from './dynamicRenderer'
export { getRouterInjectionKey } from './routerInjectionToken'
export { MATCH_ID_INJECTOR_TOKEN } from './matchInjectorToken'

// Core re-exports
export { notFound, redirect, retainSearchParams } from '@tanstack/router-core'

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
} from '@tanstack/router-core'
