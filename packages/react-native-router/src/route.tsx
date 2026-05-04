import * as React from 'react'
import {
  BaseRootRoute,
  BaseRoute,
  BaseRouteApi,
  notFound,
} from '@tanstack/router-core'
import { useLoaderData } from './useLoaderData'
import { useLoaderDeps } from './useLoaderDeps'
import { useParams } from './useParams'
import { useSearch } from './useSearch'
import { useNavigate } from './useNavigate'
import { useMatch } from './useMatch'
import { useRouter } from './useRouter'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  ConstrainLiteral,
  ErrorComponentProps as CoreErrorComponentProps,
  NotFoundRouteProps,
  RegisteredRouter,
  ResolveFullPath,
  ResolveId,
  ResolveParams,
  RootRoute as RootRouteCore,
  RootRouteId,
  RootRouteOptions,
  RouteConstraints,
  Route as RouteCore,
  RouteIds,
  RouteMask,
  RouteOptions,
  RouteTypesById,
  ToMaskOptions,
  UseNavigateResult,
  NotFoundError,
} from '@tanstack/router-core'
import type { UseLoaderDataRoute } from './useLoaderData'
import type { UseLoaderDepsRoute } from './useLoaderDeps'
import type { UseMatchRoute } from './useMatch'
import type { UseParamsRoute } from './useParams'
import type { UseSearchRoute } from './useSearch'

// Component types for React Native
export type RouteComponent<TProps = {}> = React.ComponentType<TProps>
export type ErrorRouteComponent = React.ComponentType<{
  error: Error
  reset: () => void
  info?: { componentStack: string }
}>
export type NotFoundRouteComponent = React.ComponentType<NotFoundRouteProps>

/**
 * Native screen presentation options for React Native.
 */
export interface NativeRouteOptions {
  /**
   * How this route should be presented in the native navigation stack.
   * - 'push': Standard screen push with back gesture (default)
   * - 'modal': Present as a modal
   * - 'transparentModal': Present as a transparent modal overlay
   * - 'containedModal': Modal that stays within parent bounds
   * - 'containedTransparentModal': Transparent modal within parent bounds
   * - 'fullScreenModal': Full screen modal
   * - 'formSheet': Form sheet presentation (iOS)
   * - 'none': Not a screen - renders inline (for navigators like tabs/drawer)
   */
  presentation?:
    | 'push'
    | 'modal'
    | 'transparentModal'
    | 'containedModal'
    | 'containedTransparentModal'
    | 'fullScreenModal'
    | 'formSheet'
    | 'none'

  /**
   * Enable/disable swipe gesture for back navigation (iOS).
   * @default true for 'push', false for modals
   */
  gestureEnabled?: boolean

  /**
   * Custom animation for screen transitions.
   * - 'default': Platform default animation
   * - 'fade': Fade in/out
   * - 'fade_from_bottom': Fade from bottom (Android)
   * - 'flip': Card flip
   * - 'simple_push': Simple slide
   * - 'slide_from_right': Slide from right
   * - 'slide_from_left': Slide from left
   * - 'slide_from_bottom': Slide from bottom
   * - 'none': No animation
   */
  animation?:
    | 'default'
    | 'fade'
    | 'fade_from_bottom'
    | 'flip'
    | 'simple_push'
    | 'slide_from_right'
    | 'slide_from_left'
    | 'slide_from_bottom'
    | 'none'

  /**
   * Status bar style when this screen is active.
   */
  statusBarStyle?: 'auto' | 'inverted' | 'light' | 'dark'

  /**
   * Whether this screen should be rendered with a translucent status bar.
   */
  statusBarTranslucent?: boolean

  /**
   * Controls lifecycle behavior of this route when it is in the stack.
   * - 'active': Rendered and effects running
   * - 'paused': Rendered but effects paused via React Activity
   * - 'detached': Not rendered, but still present in history
   */
  stackState?:
    | NativeStackState
    | ((ctx: NativeStackStateResolverContext) => NativeStackState)
}

export type NativeStackState = 'active' | 'paused' | 'detached'

export interface NativeStackStateResolverContext {
  pathname: string
  params: Record<string, string>
  search: unknown
  depth: number
  isTop: boolean
  navigationType: 'push' | 'pop' | 'replace' | 'none'
}

// Type extensions for components
declare module '@tanstack/router-core' {
  export interface UpdatableRouteOptionsExtensions {
    component?: RouteComponent
    errorComponent?: false | null | undefined | ErrorRouteComponent
    notFoundComponent?: NotFoundRouteComponent
    pendingComponent?: RouteComponent
    native?: NativeRouteOptions
  }

  export interface RootRouteOptionsExtensions {
    shellComponent?: ({
      children,
    }: {
      children: React.ReactNode
    }) => React.ReactNode
  }

  export interface RouteExtensions<
    in out TId extends string,
    in out TFullPath extends string,
  > {
    useMatch: UseMatchRoute<TId>
    useSearch: UseSearchRoute<TId>
    useParams: UseParamsRoute<TId>
    useLoaderData: UseLoaderDataRoute<TId>
    useLoaderDeps: UseLoaderDepsRoute<TId>
    useNavigate: () => UseNavigateResult<TFullPath>
  }
}

/**
 * Returns a route-specific API bound to a single route ID.
 */
export function getRouteApi<
  const TId,
  TRouter extends AnyRouter = RegisteredRouter,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
  return new RouteApi<TId, TRouter>({ id })
}

export class RouteApi<
  TId,
  TRouter extends AnyRouter = RegisteredRouter,
> extends BaseRouteApi<TId, TRouter> {
  constructor({ id }: { id: TId }) {
    super({ id })
  }

  useMatch: UseMatchRoute<TId> = (opts) => {
    return useMatch({
      select: opts?.select,
      from: this.id,
      structuralSharing: opts?.structuralSharing,
    } as any) as any
  }

  useSearch: UseSearchRoute<TId> = (opts) => {
    return useSearch({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useParams: UseParamsRoute<TId> = (opts) => {
    return useParams({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useLoaderData: UseLoaderDataRoute<TId> = (opts) => {
    return useLoaderData({ ...opts, from: this.id, strict: false } as any)
  }

  useLoaderDeps: UseLoaderDepsRoute<TId> = (opts) => {
    return useLoaderDeps({ ...opts, from: this.id, strict: false } as any)
  }

  useNavigate = (): UseNavigateResult<
    RouteTypesById<TRouter, TId>['fullPath']
  > => {
    const router = useRouter()
    return useNavigate({ from: router.routesById[this.id as string].fullPath })
  }

  notFound = (opts?: NotFoundError) => {
    return notFound({ routeId: this.id as string, ...opts })
  }
}

// Route class
export class Route<
  in out TRegister = unknown,
  in out TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  in out TPath extends RouteConstraints['TPath'] = '/',
  in out TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    TPath
  >,
  in out TCustomId extends RouteConstraints['TCustomId'] = string,
  in out TId extends RouteConstraints['TId'] = ResolveId<
    TParentRoute,
    TCustomId,
    TPath
  >,
  in out TSearchValidator = undefined,
  in out TParams = ResolveParams<TPath>,
  in out TRouterContext = AnyContext,
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
  in out TSSR = unknown,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
> extends BaseRoute<
  TRegister,
  TParentRoute,
  TPath,
  TFullPath,
  TCustomId,
  TId,
  TSearchValidator,
  TParams,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren,
  TFileRouteTypes,
  TSSR,
  TServerMiddlewares,
  THandlers
> {
  constructor(
    options?: RouteOptions<
      TRegister,
      TParentRoute,
      TId,
      TCustomId,
      TFullPath,
      TPath,
      TSearchValidator,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TSSR,
      TServerMiddlewares,
      THandlers
    >,
  ) {
    super(options)
    ;(this as any).$$typeof = Symbol.for('react.memo')
  }

  useMatch: UseMatchRoute<TId> = (opts) => {
    return useMatch({
      select: opts?.select,
      from: this.id,
      structuralSharing: opts?.structuralSharing,
    } as any) as any
  }

  useSearch: UseSearchRoute<TId> = (opts) => {
    return useSearch({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useParams: UseParamsRoute<TId> = (opts) => {
    return useParams({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useLoaderData: UseLoaderDataRoute<TId> = (opts) => {
    return useLoaderData({ ...opts, from: this.id, strict: false } as any)
  }

  useLoaderDeps: UseLoaderDepsRoute<TId> = (opts) => {
    return useLoaderDeps({ ...opts, from: this.id, strict: false } as any)
  }

  useNavigate = (): UseNavigateResult<TFullPath> => {
    const router = useRouter()
    return useNavigate({ from: router.routesById[this.id as string].fullPath })
  }
}

// RootRoute class
export class RootRoute<
  in out TRegister = unknown,
  in out TSearchValidator = undefined,
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
  in out TSSR = unknown,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
> extends BaseRootRoute<
  TRegister,
  TSearchValidator,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren,
  TFileRouteTypes,
  TSSR,
  TServerMiddlewares,
  THandlers
> {
  constructor(
    options?: RootRouteOptions<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      TServerMiddlewares,
      THandlers
    >,
  ) {
    super(options)
    ;(this as any).$$typeof = Symbol.for('react.memo')
  }

  useMatch: UseMatchRoute<RootRouteId> = (opts) => {
    return useMatch({
      select: opts?.select,
      from: this.id,
      structuralSharing: opts?.structuralSharing,
    } as any) as any
  }

  useSearch: UseSearchRoute<RootRouteId> = (opts) => {
    return useSearch({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useParams: UseParamsRoute<RootRouteId> = (opts) => {
    return useParams({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useLoaderData: UseLoaderDataRoute<RootRouteId> = (opts) => {
    return useLoaderData({ ...opts, from: this.id } as any)
  }

  useLoaderDeps: UseLoaderDepsRoute<RootRouteId> = (opts) => {
    return useLoaderDeps({ ...opts, from: this.id } as any)
  }

  useNavigate = (): UseNavigateResult<'/'> => {
    return useNavigate({ from: this.fullPath })
  }
}

/**
 * Create a new route for React Native.
 */
export function createRoute<
  TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  TPath extends RouteConstraints['TPath'] = '/',
  TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    TPath
  >,
  TCustomId extends RouteConstraints['TCustomId'] = string,
  TId extends RouteConstraints['TId'] = ResolveId<
    TParentRoute,
    TCustomId,
    TPath
  >,
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouterContext = AnyContext,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
>(
  options: RouteOptions<
    unknown,
    TParentRoute,
    TId,
    TCustomId,
    TFullPath,
    TPath,
    TSearchValidator,
    TParams,
    TLoaderDeps,
    TLoaderFn,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TSSR,
    TServerMiddlewares,
    THandlers
  >,
) {
  return new Route(options)
}

/**
 * Create a root route for React Native.
 */
export function createRootRoute<
  TRegister = unknown,
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  const TServerMiddlewares = unknown,
  THandlers = undefined,
>(
  options?: RootRouteOptions<
    TRegister,
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TSSR,
    TServerMiddlewares,
    THandlers
  >,
): RootRoute<
  TRegister,
  TSearchValidator,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  unknown,
  unknown,
  TSSR,
  TServerMiddlewares,
  THandlers
> {
  return new RootRoute<
    TRegister,
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    unknown,
    unknown,
    TSSR,
    TServerMiddlewares,
    THandlers
  >(options as any)
}

/**
 * Create a route mask for React Native.
 */
export function createRouteMask<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string = string,
>(
  opts: {
    routeTree: TRouter['routeTree']
  } & ToMaskOptions<TRouter, TFrom, TTo>,
): RouteMask<TRouter['routeTree']> {
  return opts as any
}
