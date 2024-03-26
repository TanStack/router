//
export {
  createHistory,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  type BlockerFn,
  type HistoryLocation,
  type RouterHistory,
  type ParsedPath,
} from '@tanstack/history'
export { default as invariant } from 'tiny-invariant'
export { default as warning } from 'tiny-warning'
export * from './awaited'
export * from './defer'
export * from './CatchBoundary'
export * from './fileRoute'
export * from './history'
export * from './lazyRouteComponent'
export * from './link'
export * from './location'
export * from './Matches'
export * from './path'
export * from './qss'
export * from './redirects'
export * from './route'
export * from './routeInfo'
export {
  componentTypes,
  createRouter,
  Router,
  lazyFn,
  SearchParamError,
  PathParamError,
  getInitialRouterState,
  defaultSerializeError,
  type Register,
  type AnyRouter,
  type RegisteredRouter,
  type HydrationCtx,
  type RouterContextOptions,
  type RouterOptions,
  type RouterTransformer,
  type RouterErrorSerializer,
  type RouterState,
  type ListenerFn,
  type BuildNextOptions,
  type DehydratedRouterState,
  type DehydratedRouteMatch,
  type DehydratedRouter,
  type RouterConstructorOptions,
  type RouterEvents,
  type RouterEvent,
} from './router'
export {
  RouterProvider,
  getRouteMatch,
  type RouterProps,
  type CommitLocationOptions,
  type MatchLocation,
  type NavigateFn,
  type BuildLocationFn,
  type InjectedHtmlEntry,
} from './RouterProvider'
export {
  useScrollRestoration,
  useElementScrollRestoration,
  ScrollRestoration,
  type ScrollRestorationOptions,
} from './scroll-restoration'
export {
  defaultParseSearch,
  defaultStringifySearch,
  parseSearchWith,
  stringifySearchWith,
  type SearchSerializer,
  type SearchParser,
} from './searchParams'
export { useBlocker, Block } from './useBlocker'
export { useNavigate, Navigate, type UseNavigateResult } from './useNavigate'
export { useParams } from './useParams'
export { useSearch } from './useSearch'
export {
  getRouterContext, // SSR
} from './routerContext'
export { useRouteContext } from './useRouteContext'
export { useRouter } from './useRouter'
export { useRouterState } from './useRouterState'
export {
  escapeJSON, // SSR
  useLayoutEffect, // SSR
} from './utils'
export {
  notFound,
  isNotFound,
  CatchNotFound,
  DefaultGlobalNotFound,
  type NotFoundError,
} from './not-found'
