export { createRouter } from './router'
export type { Router } from './router'

export { createRoute, createRootRoute, Route, RootRoute } from './route'
export type {
  VanillaRouteComponent,
  VanillaErrorRouteComponent,
  VanillaNotFoundRouteComponent,
} from './types'

export {
  buildHref,
  getMatchesHtml,
  outlet,
  setupLinkHandlers,
  vanillaRouter,
} from './vanilla-router'

// Router state utilities
export {
  subscribeRouterState,
  getRouterState,
  getLocation,
  getMatches,
} from './utils'

// Navigation utilities
export { navigate, canGoBack, goBack, goForward, go } from './navigation'

// Route data utilities
export {
  getMatchData,
  getParams,
  getSearch,
  getLoaderData,
  getRouteContext,
  getLoaderDeps,
} from './route-data'

// Error handling utilities
export {
  checkIsNotFound,
  checkIsRedirect,
  getErrorComponent,
  getNotFoundComponent,
  isNotFound,
  isRedirect,
} from './error-handling'

// Scroll restoration utilities
export {
  setupScrollRestorationUtil as setupScrollRestoration,
  getScrollPosition,
  saveScrollPosition,
} from './scroll-restoration'

// File route utilities
export {
  createFileRoute,
  FileRoute,
  FileRouteLoader,
  createLazyRoute,
  createLazyFileRoute,
  LazyRoute,
} from './fileRoute'

// Re-export core types and utilities
export type {
  AnyRouter,
  AnyRoute,
  RouterState,
  NavigateOptions,
  ParsedLocation,
} from '@tanstack/router-core'

export { redirect, notFound } from '@tanstack/router-core'

export {
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
} from '@tanstack/history'

export type { RouterHistory, HistoryLocation } from '@tanstack/history'
