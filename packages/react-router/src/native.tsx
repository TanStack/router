'use client'

import type * as React from 'react'
import type {
  AnyRoute,
  AnyRouteMatch,
  AnyRouter,
  RouterState,
  StackMatch,
} from '@tanstack/router-core'

export {
  BaseRootRoute,
  BaseRoute,
  BaseRouteApi,
  DEFAULT_PROTOCOL_ALLOWLIST,
  DEV_STYLES_ATTR,
  PathParamError,
  RawStream,
  RouterCore,
  SearchParamError,
  TSR_DEFERRED_PROMISE,
  appendUniqueUserTags,
  buildDevStylesUrl,
  cleanPath,
  composeRewrites,
  createControlledPromise,
  createInlineCssStyleAsset,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  createRawStreamDeserializePlugin,
  createRawStreamRPCPlugin,
  createRouterConfig,
  createSerializationAdapter,
  decode,
  deepEqual,
  defaultGetScrollRestorationKey,
  defaultParseSearch,
  defaultSerializeError,
  defaultSerovalPlugins,
  defaultStringifySearch,
  defer,
  encode,
  escapeHtml,
  exactPathTest,
  executeRewriteInput,
  functionalUpdate,
  getAssetCrossOrigin,
  getElementScrollRestorationEntry,
  getInitialRouterState,
  getLocationChangeInfo,
  getManifestScriptFormat,
  getMatchedRoutes,
  getScriptPreloadAttrs,
  getStylesheetHref,
  hasKeys,
  interpolatePath,
  invariant,
  isDangerousProtocol,
  isMatch,
  isModuleNotFoundError,
  isNotFound,
  isPlainArray,
  isPlainObject,
  isRedirect,
  isResolvedRedirect,
  joinPaths,
  lazyFn,
  makeSerovalPlugin,
  makeSsrSerovalPlugin,
  notFound,
  parseRedirect,
  parseSearchWith,
  preloadWarning,
  redirect,
  removeTrailingSlash,
  replaceEqualDeep,
  resolveManifestAssetLink,
  resolveManifestCssLink,
  resolvePath,
  retainSearchParams,
  rootRouteId,
  setupScrollRestoration,
  storageKey,
  stringifySearchWith,
  stripSearchParams,
  trailingSlashOptions,
  trimPath,
  trimPathLeft,
  trimPathRight,
} from '@tanstack/router-core'
export type * from '@tanstack/router-core'

export { createMemoryHistory } from '@tanstack/history'
export type {
  BlockerFn,
  HistoryLocation,
  HistoryState,
  ParsedHistoryState,
  ParsedPath,
  RouterHistory,
} from '@tanstack/history'

export {
  FileRoute,
  FileRouteLoader,
  LazyRoute,
  createFileRoute,
  createLazyFileRoute,
  createLazyRoute,
} from './fileRoute'

export {
  NotFoundRoute,
  RootRoute,
  Route,
  RouteApi,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouteMask,
  getRouteApi,
  rootRouteWithContext,
} from './route'
export type {
  AnyRootRoute,
  AsyncRouteComponent,
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RouteComponent,
} from './route'

export { Router, createRouter } from './router'

export {
  MatchRoute,
  Matches,
  useChildMatches,
  useMatchRoute,
  useMatches,
  useParentMatches,
} from './Matches'
export type { MakeMatchRouteOptions, UseMatchRouteOptions } from './Matches'
export { Match, Outlet } from './Match'

export { Await, useAwaited } from './awaited'
export type { AwaitOptions } from './awaited'
export { ClientOnly, useHydrated } from './ClientOnly'
export { CatchBoundary } from './CatchBoundary'
export { CatchNotFound } from './not-found'
export { lazyRouteComponent } from './lazyRouteComponent'

export { Block, useBlocker } from './useBlocker'
export type { ShouldBlockFn, UseBlockerOpts } from './useBlocker'

export { Navigate } from './useNavigate'
export { useCanGoBack } from './useCanGoBack'
export { useLoaderData } from './useLoaderData'
export type {
  UseLoaderDataBaseOptions,
  UseLoaderDataOptions,
  UseLoaderDataRoute,
} from './useLoaderData'
export { useLoaderDeps } from './useLoaderDeps'
export type {
  UseLoaderDepsBaseOptions,
  UseLoaderDepsOptions,
  UseLoaderDepsRoute,
} from './useLoaderDeps'
export { useLocation } from './useLocation'
export type { UseLocationBaseOptions, UseLocationResult } from './useLocation'
export { useMatch } from './useMatch'
export type {
  UseMatchBaseOptions,
  UseMatchOptions,
  UseMatchResult,
  UseMatchRoute,
} from './useMatch'
export { useParams } from './useParams'
export type {
  UseParamsBaseOptions,
  UseParamsOptions,
  UseParamsRoute,
} from './useParams'
export { useRouteContext } from './useRouteContext'
export type { UseRouteContextRoute } from './useRouteContext'
export { useRouter } from './useRouter'
export { useRouterState } from './useRouterState'
export type {
  UseRouterStateOptions,
  UseRouterStateResult,
} from './useRouterState'
export { useSearch } from './useSearch'
export type {
  UseSearchBaseOptions,
  UseSearchOptions,
  UseSearchRoute,
} from './useSearch'

export {
  RouterStateSnapshotProvider,
  createRouterStateSnapshotStore,
} from './routerStateSnapshot'
export type {
  RouterStateSnapshotStore,
  WritableRouterStateSnapshotStore,
} from './routerStateSnapshot'
export { RouteLinkProvider } from './routeLink'
export type { RouteLinkComponent } from './routeLink'
export { RouterContextProviderBase } from './routerContextProvider'
export type { RouterProps } from './routerContextProvider'
export { RouterRendererProvider } from './routerRenderer'
export type { RouterRenderer } from './routerRenderer'
export { Transitioner } from './Transitioner'

export type {
  InferStructuralSharing,
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
  ValidateUseParamsOptions,
  ValidateUseSearchOptions,
} from './typePrimitives'

export type NativeAnimation =
  | 'default'
  | 'fade'
  | 'fade_from_bottom'
  | 'flip'
  | 'simple_push'
  | 'slide_from_right'
  | 'slide_from_left'
  | 'slide_from_bottom'
  | 'none'

export interface NativeRouteContext {
  pathname: string
  href: string
  routeId: string
  match: AnyRouteMatch
  matches: Array<AnyRouteMatch>
  params: Record<string, string>
  search: unknown
  loaderData: unknown
  context: unknown
  staticData: Record<string, unknown>
  canGoBack: boolean
}

export interface NativeGetIdContext {
  pathname: string
  href: string
  params: Record<string, string>
  search: unknown
}

export interface NativeHeaderStyleExtensions {}

export interface NativeHeaderStyle extends NativeHeaderStyleExtensions {
  backgroundColor?: string
}

export type NativeBooleanRouteOption =
  | boolean
  | ((context: NativeRouteContext) => boolean)

/** Platform adapters augment this interface with host-specific options. */
export interface NativeRouteOptionsExtensions {}

/** Route metadata with consistent semantics across native React renderers. */
export interface NativeRouteOptions extends NativeRouteOptionsExtensions {
  title?: string | ((context: NativeRouteContext) => string)
  headerShown?: NativeBooleanRouteOption
  headerBackVisible?: NativeBooleanRouteOption
  headerBackTitle?: string
  headerLargeTitle?: boolean
  headerStyle?: NativeHeaderStyle
  header?: React.ReactNode | ((context: NativeRouteContext) => React.ReactNode)
  gestureEnabled?: boolean
  animation?: NativeAnimation
  getId?: (context: NativeGetIdContext) => string
  stackMatch?: StackMatch
}

export type NativeRouteOptionsInput =
  | NativeRouteOptions
  | ((context: NativeRouteContext) => NativeRouteOptions)

declare module '@tanstack/router-core' {
  interface UpdatableRouteOptionsExtensions {
    native?: NativeRouteOptionsInput
  }
}

function mergeNativeRouteOptions(
  previous: NativeRouteOptions,
  next: NativeRouteOptions,
): NativeRouteOptions {
  return {
    ...previous,
    ...next,
    headerStyle:
      previous.headerStyle || next.headerStyle
        ? { ...previous.headerStyle, ...next.headerStyle }
        : undefined,
  }
}

export function resolveNativeRouteOptions(
  router: AnyRouter,
  state: RouterState<AnyRoute>,
): {
  context: NativeRouteContext
  options: NativeRouteOptions
} {
  const matches = state.matches as Array<AnyRouteMatch>
  const leaf = matches[matches.length - 1]!
  let options: NativeRouteOptions = {}

  const makeContext = (match: AnyRouteMatch): NativeRouteContext => {
    const route = router.routesById[match.routeId]
    return {
      pathname: state.location.pathname,
      href: state.location.href,
      routeId: match.routeId,
      match,
      matches,
      params: match.params as Record<string, string>,
      search: match.search,
      loaderData: match.loaderData,
      context: match.context,
      staticData: (route?.options.staticData ?? {}) as Record<string, unknown>,
      canGoBack: state.location.state.__TSR_index > 0,
    }
  }

  for (const match of matches) {
    const input = router.routesById[match.routeId]?.options.native
    if (!input) {
      continue
    }

    const context = makeContext(match)
    const resolved = typeof input === 'function' ? input(context) : input
    options = mergeNativeRouteOptions(options, resolved)
  }

  return {
    context: makeContext(leaf),
    options,
  }
}
