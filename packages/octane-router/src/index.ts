// @tanstack/octane-router — TanStack Router for the Octane renderer.
//
// TanStack Router splits a framework-agnostic core (`@tanstack/router-core`: the
// Router/route-tree/matching/history/reactive-store) from a thin React binding
// (`@tanstack/react-router`). This package re-exports the core verbatim and
// implements the framework binding on Octane's hooks. The
// load-bearing seam is router-core's reactive store: `createRouter` supplies the
// CLIENT store factory (`createAtom`/`batch` from `@tanstack/store`), whose atoms
// expose `.subscribe`/`.get` — bound to octane's `useSyncExternalStore` by
// `useStore`. The match tree renders pull-based: `RouterProvider` → first match →
// each route's `<Outlet/>` looks up the NEXT match via `matchContext`.
//
// Scope: code- and file-based routing at framework parity — RouterProvider (+
// RouterContextProvider/Wrap/InnerWrap), the full Match pipeline (Suspense /
// CatchBoundary / CatchNotFound per route, pending/error/redirect statuses,
// remountDeps, shellComponent), the router event lifecycle
// (onLoad/onBeforeRouteMount/onResolved/onRendered + resolvedLocation — scroll
// restoration restores off it), Link with preloading/masking/active-options,
// createLink/useLinkProps, navigation blocking (useBlocker/Block), the full
// read-hook set (useMatch and friends, nearest-match resolution via
// matchContext), Route/getRouteApi hook accessors, Await/useAwaited, lazy
// routes, search validation/middleware from core, generator integration, and
// Start-compatible SSR/head/script entries. Devtools remain separate.
import './frameworkTypes'

export * from '@tanstack/router-core'
export type {
  AsyncRouteComponent,
  DefaultRouteTypes,
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RouteComponent,
  RouteTypes,
} from './frameworkTypes'
export {
  createHistory,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
} from './history'
// History types on the main entry (upstream parity). `NavigateOptions` is NOT
// re-exported from history — router-core's richer NavigateOptions wins.
export type {
  RouterHistory,
  HistoryLocation,
  ParsedPath,
  HistoryState,
  ParsedHistoryState,
  HistoryAction,
  BlockerFnArgs,
  BlockerFn,
  NavigationBlocker,
} from '@tanstack/history'

export { createRouter, Router } from './router'
export {
  createRoute,
  createRootRoute,
  createRootRouteWithContext,
  rootRouteWithContext,
  createRouteMask,
  getRouteApi,
  Route,
  RootRoute,
  RouteApi,
  NotFoundRoute,
} from './route'
export type { AnyRootRoute } from './route'
export {
  FileRoute,
  createFileRoute,
  FileRouteLoader,
  LazyRoute,
  createLazyRoute,
  createLazyFileRoute,
} from './fileRoute'
export {
  routerContext,
  getRouterContext,
  matchContext,
  useRouter,
} from './context'
export { useStore } from './useStore'
export { useRouterState } from './useRouterState'
export type {
  UseRouterStateOptions,
  UseRouterStateResult,
} from './useRouterState'
export {
  useMatch,
  useLocation,
  useParams,
  useSearch,
  useLoaderData,
  useLoaderDeps,
  useRouteContext,
  useMatches,
  useParentMatches,
  useChildMatches,
  useNavigate,
  useCanGoBack,
} from './hooks'
export type {
  UseLoaderDataBaseOptions,
  UseLoaderDataOptions,
  UseLoaderDataRoute,
  UseLoaderDepsBaseOptions,
  UseLoaderDepsOptions,
  UseLoaderDepsRoute,
  UseLocationBaseOptions,
  UseLocationResult,
  UseMatchBaseOptions,
  UseMatchOptions,
  UseMatchResult,
  UseMatchRoute,
  UseMatchesBaseOptions,
  UseMatchesResult,
  UseParamsBaseOptions,
  UseParamsOptions,
  UseParamsRoute,
  UseRouteContextRoute,
  UseSearchBaseOptions,
  UseSearchOptions,
  UseSearchRoute,
} from './hooks'
export { useAwaited } from './useAwaited'
export type { AwaitOptions } from './useAwaited'
export { useLinkProps, createLink, linkOptions } from './link'
export type {
  ActiveLinkOptionProps,
  ActiveLinkOptions,
  CreateLinkProps,
  LinkComponent,
  LinkComponentProps,
  LinkComponentRoute,
  LinkOptionsFn,
  LinkOptionsFnOptions,
  LinkProps,
  LinkPropsChildren,
  OctaneAnchorProps,
  OctaneRenderable,
  UseLinkPropsOptions,
} from './link'
export { useBlocker, Block } from './useBlocker.tsrx'
export type {
  BlockerResolver,
  ShouldBlockFn,
  ShouldBlockFnArgs,
  UseBlockerOpts,
} from './useBlocker.tsrx'
export { useMatchRoute, MatchRoute } from './MatchRoute.tsrx'
export type {
  MakeMatchRouteOptions,
  MatchRouteFn,
  UseMatchRouteOptions,
} from './MatchRoute.tsrx'
export { useElementScrollRestoration } from './useElementScrollRestoration'
export { lazyRouteComponent } from './lazyRouteComponent'

export { RouterProvider, RouterContextProvider } from './RouterProvider.tsrx'
export type { RouterProps } from './RouterProvider.tsrx'
export { Outlet } from './Outlet.tsrx'
export { Link } from './Link.tsrx'
export { Navigate } from './Navigate.tsrx'
export { Await } from './Await.tsrx'
export { ScrollRestoration } from './ScrollRestoration.tsrx'
export { Matches } from './Matches.tsrx'
export { Match } from './Match.tsrx'
export { CatchBoundary, ErrorComponent } from './CatchBoundary.tsrx'
export { CatchNotFound, DefaultGlobalNotFound } from './not-found.tsrx'
export { ClientOnly, useHydrated } from './ClientOnly.tsrx'
export { HeadContent } from './HeadContent.tsrx'
export type { HeadContentProps } from './HeadContent.tsrx'
export { Scripts } from './Scripts.tsrx'
export { ScriptOnce } from './ScriptOnce.tsrx'
export { Asset } from './Asset.tsrx'
export type { AssetProps } from './Asset.tsrx'
export { useTags } from './headContentUtils'
export { Html } from './Html'
export type { HtmlProps } from './Html'
export { Head } from './Head'
export type { HeadProps } from './Head'
export { Body } from './Body'
export type { BodyProps } from './Body'

export type {
  InferStructuralSharing,
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
  ValidateUseParamsOptions,
  ValidateUseSearchOptions,
} from './typePrimitives'
