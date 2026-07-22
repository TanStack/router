export * from '@tanstack/react-router/native'

export { createNativeScriptHistory, isNativeScriptHistory } from './history'
export type {
  NativeScriptHistoryOptions,
  NativeScriptHistoryStackEntry,
  NativeScriptRouterHistory,
} from './history'

export {
  NativeScriptRouter,
  assertNativeScriptRouter,
  createNativeScriptRouter,
  createNativeScriptRouter as createRouter,
  isNativeScriptRouter,
} from './router'
export type {
  AnyNativeScriptRouter,
  CreateNativeScriptRouterOptions,
  NativeScriptRouterOptions,
} from './router'

export {
  NativeScriptRouterProvider,
  NativeScriptRouterProvider as RouterProvider,
} from './NativeScriptRouterProvider'
export type { NativeScriptRouterProviderProps } from './NativeScriptRouterProvider'

export {
  Link,
  linkOptions,
  useNativeScriptLinkProps,
  useNativeScriptLinkProps as useLinkProps,
} from './Link'
export type {
  NativeScriptActiveLinkOptions,
  NativeScriptLinkProps,
} from './Link'

export {
  NativeScriptErrorComponent,
  NativeScriptNotFoundComponent,
} from './fallbacks'

export { Navigate, useNavigate } from './useNavigate'
export { resolveNativeScriptNavigateOptions } from './native-navigation'

export { startNativeScriptApp } from './start'
export type { StartNativeScriptAppOptions } from './start'

export { navigateNativeScriptURL, parseNativeScriptURL } from './linking'
export type {
  NativeScriptLinkingMode,
  NativeScriptLinkingOptions,
} from './linking'

export {
  createNativeScriptNavigationState,
  createNativeScriptTransitionState,
} from './navigation-state'
export type {
  NativeScriptNavigationOptions,
  NativeScriptNavigationState,
} from './navigation-state'

export type {
  NativeAnimation,
  NativeScriptHeaderStyle,
  NativeScriptGetIdContext,
  NativeScriptNavigationTransition,
  NativeScriptRouteContext,
  NativeScriptRouteOptions,
  NativeScriptRouteOptionsInput,
} from './route-options'
