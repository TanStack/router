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
export * from './router'
export * from './RouterProvider'
export * from './scroll-restoration'
export * from './searchParams'
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
