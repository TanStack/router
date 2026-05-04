// Module augmentations for route/router options must load before any
// downstream code reads them. Keep this import first.
import './extensions'

// Re-export the framework-agnostic core surface verbatim. The Remix binding
// is purely additive — it provides reactivity glue and view components,
// not a different routing model.
export * from '@tanstack/router-core'

export type {
  RemixRouteComponent,
  RemixErrorRouteComponent,
  RemixNotFoundRouteComponent,
} from './extensions'

// Router factory bound to the Remix 3 reactivity adapter.
export { createRouter } from './createRouter'
export type { Router } from './createRouter'

// Route classes + factories. Subclasses of `BaseRoute` / `BaseRootRoute`
// from router-core that add Remix-specific instance accessors
// (`route.useMatch(handle, …)`, `route.useLoaderData(handle, …)`, etc.)
// pre-bound to `this.id` / `this.fullPath`.
export {
  Route,
  RootRoute,
  NotFoundRoute,
  createRoute,
  createRootRoute,
  createRootRouteWithContext,
} from './route'
export type { AnyRootRoute } from './route'
export { RouteApi, getRouteApi } from './routeApi'

// Augments `@tanstack/history` with state-bookkeeping field types.
import './history'

// Async data.
export { Await, useAwaited } from './awaited'
export type { AwaitOptions, AwaitProps } from './awaited'

// Boundaries.
export { CatchBoundary, ErrorComponent } from './CatchBoundary'
export type { CatchBoundaryProps } from './CatchBoundary'
export { CatchNotFound, DefaultGlobalNotFound } from './not-found'
export type { CatchNotFoundProps } from './not-found'
// `renderRouteNotFound` is intentionally NOT exported — it's an
// internal helper used by `<Match>` to resolve the not-found UI
// chain. Solid- and vue-router keep theirs internal too. Apps
// that need the same logic should configure
// `defaultNotFoundComponent` on the router or `notFoundComponent`
// on the route.

// SSR / document tags.
export { HeadContent } from './HeadContent'
export type { HeadContentProps } from './HeadContent'
export { Scripts } from './Scripts'
export { ScriptOnce } from './ScriptOnce'
export type { ScriptOnceProps } from './ScriptOnce'
export {
  ScrollRestoration,
  useElementScrollRestoration,
} from './ScrollRestoration'
export { buildHeadTags, buildHeadTags as useTags, uniqBy } from './headContentUtils'

// `Transitioner` is intentionally NOT exported. It's the
// router-state lifecycle component rendered automatically inside
// `<Matches>` — react- and solid-router keep theirs internal too.
// Apps should never need to mount it directly.

// File-based routing helpers (used by the codegen output).
export {
  createFileRoute,
  FileRoute,
  LazyRoute,
  createLazyRoute,
  createLazyFileRoute,
} from './fileRoute'

// Code-splitting helper for route components.
export { lazyRouteComponent } from './lazyRouteComponent'

// Doc / asset helpers.
export { Asset } from './Asset'
export type { AssetProps } from './Asset'
export { ClientOnly, useHydrated } from './ClientOnly'
export type { ClientOnlyProps } from './ClientOnly'

// View components.
export { RouterProvider, RouterContextProvider } from './RouterProvider'
export type {
  RouterProviderProps,
  RouterContextProviderProps,
  RouterProps,
} from './RouterProvider'
export { Navigate } from './Navigate'
export type { NavigateProps } from './Navigate'
export { MatchRoute } from './MatchRoute'
export type { MakeMatchRouteOptions } from './MatchRoute'
export { Match } from './Match'
export type { MatchProps } from './Match'
export { Matches } from './Matches'
export { Outlet } from './Outlet'
export { Link, createLink, linkOptions } from './Link'
export { useLinkProps } from './useLinkProps'
export { ClientLink } from './ClientLink'
export type { ClientLinkProps } from './ClientLink'

// Module-level "active router" singleton — used by clientEntry'd
// components that hydrate outside the `<RouterProvider>` tree.
export {
  setActiveRouter,
  getActiveRouter,
  clearActiveRouter,
} from './activeRouter'
export type {
  LinkProps,
  LinkComponentProps,
  LinkComponent,
  ActiveLinkOptions,
  ActiveLinkOptionProps,
  LinkPropsChildren,
  LinkOptionsFn,
  LinkOptionsFnOptions,
  CreateLinkProps,
} from './Link'
export type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
  ValidateUseSearchOptions,
  ValidateUseParamsOptions,
  InferStructuralSharing,
} from './typePrimitives'
// `MatchContext` and `getMatchId` are intentionally NOT exported —
// they're internal context-key plumbing used by `<Match>`,
// `<Outlet>`, `useMatch`, and `useMatches`. React- and solid-router
// keep their `matchContext` internal too. Apps that need access to
// the current matchId go through `useMatch(handle)` (with no
// `from`) which subscribes to the nearest enclosing match.

// Setup-time accessors. `remix/ui` doesn't have a fiber-style hook stack,
// so each accessor takes the component `handle` as its first argument and
// returns a getter `() => T` to be called inside the render function.
export { useRouter } from './useRouter'
export { useRouterState } from './useRouterState'
export type { UseRouterStateOptions, UseRouterStateResult } from './useRouterState'
export { useLocation } from './useLocation'
export type { UseLocationBaseOptions, UseLocationResult } from './useLocation'
export { useNavigate } from './useNavigate'
export { useMatch } from './useMatch'
export type {
  UseMatchOptions,
  UseMatchBaseOptions,
  UseMatchResult,
} from './useMatch'
export {
  useMatches,
  useParentMatches,
  useChildMatches,
  useMatchRoute,
} from './useMatches'
export type {
  UseMatchesBaseOptions,
  UseMatchesResult,
  UseMatchRouteOptions,
} from './useMatches'
export { useParams } from './useParams'
export type { UseParamsBaseOptions, UseParamsOptions } from './useParams'
export { useSearch } from './useSearch'
export type { UseSearchBaseOptions, UseSearchOptions } from './useSearch'
export { useLoaderData } from './useLoaderData'
export type {
  UseLoaderDataBaseOptions,
  UseLoaderDataOptions,
} from './useLoaderData'
export { useLoaderDeps } from './useLoaderDeps'
export type {
  UseLoaderDepsBaseOptions,
  UseLoaderDepsOptions,
} from './useLoaderDeps'
export { useRouteContext } from './useRouteContext'
export { useCanGoBack } from './useCanGoBack'
export { useBlocker, Block } from './useBlocker'
export type {
  UseBlockerOpts,
  ShouldBlockFn,
  BlockerResolver,
  BlockProps,
} from './useBlocker'

// Subscribe primitives. `subscribeStore` and `subscribeDynamicStore`
// are public — they're the building blocks for handle-based
// reactivity, and route components can use them to subscribe to
// individual router stores (e.g. `router.stores.loadedAt`,
// `router.stores.matchStores.get(id)`) that don't have a dedicated
// hook. `subscribeSelected` is intentionally NOT exported — it's a
// thin internal wrapper that adds `select` + structural sharing on
// top of `subscribeStore`, used by the higher-level hooks
// (`useRouterState`, `useLocation`, `useMatches`). External callers
// should use the higher-level hook with a `select` option instead.
export { subscribeStore, subscribeDynamicStore } from './subscribe'

// `getStoreFactory` is intentionally NOT exported. It's the
// router-core hook that wires `@tanstack/store` atoms into the
// reactivity system; consumers go through `createRouter` which
// applies it. React- and solid-router keep theirs internal too.
// Tests can import it from `./routerStores` if needed.

// Client mount helper.
export { mountRouter } from './mountRouter'

// Structural-sharing types (re-exported for binding consumers).
export type {
  StructuralSharingOption,
  ValidateSelected,
  StructuralSharingEnabled,
  RequiredStructuralSharing,
  DefaultStructuralSharingEnabled,
} from './structuralSharing'
