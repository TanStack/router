import * as React from 'react'
import { notFound } from '@tanstack/router-core'
import {
  bindRouteScopeOptions,
  createScopedRedirect,
  getInstallationRouteIdMapper,
  getScopedRouterView,
  installRouteModules,
} from '@tanstack/router-core/_internal/route-module'
import { Route, getRouteApi } from './route'
import { Link, useLinkProps } from './link'
import { Navigate, useNavigate } from './useNavigate'
import { MatchRoute, useMatchRoute } from './Matches'
import { useRouter } from './useRouter'
import { matchContext } from './matchContext'
import { useMatch } from './useMatch'
import { useLoaderData } from './useLoaderData'
import { useLoaderDeps } from './useLoaderDeps'
import { useSearch } from './useSearch'
import { useParams } from './useParams'
import { useRouteContext } from './useRouteContext'
import type { UseBlockerFn } from './useBlocker'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  ModuleRootRoute,
  ModuleRootRouteOptions,
  NotFoundError,
  RedirectFn,
  RouteIds,
  ScopedRouterView,
} from '@tanstack/router-core'
import type { FileRouteFactory } from './fileRoute'
import type { GetRouteApiFn } from './route'
import type {
  CreateLinkFn,
  LinkComponent,
  LinkOptionsFn,
  UseLinkPropsFn,
} from './link'
import type { NavigateComponentFn, UseNavigateFn } from './useNavigate'
import type {
  MatchRouteFn,
  UseChildMatchesFn,
  UseMatchRouteFn,
  UseMatchesFn,
  UseParentMatchesFn,
} from './Matches'
import type { UseMatchFn } from './useMatch'
import type { UseLoaderDataFn } from './useLoaderData'
import type { UseLoaderDepsFn } from './useLoaderDeps'
import type { UseSearchFn } from './useSearch'
import type { UseParamsFn } from './useParams'
import type { UseRouteContextFn } from './useRouteContext'
import type { UseLocationFn } from './useLocation'
import type { UseRouterStateFn } from './useRouterState'

/** An entry of a generated module-local `FileRoutesByPath` interface. */
export interface FileRoutesByPathEntry {
  id: string
  path: string
  fullPath: string
  parentRoute: AnyRoute
}

// Entries reference the route files, whose types depend on these factories:
// read one property at a time and never constrain or check whole entries.
type FileRouteEntry<TFileRoutesByPath, TFilePath> =
  TFileRoutesByPath[TFilePath & keyof TFileRoutesByPath]
type FileRouteParent<TFileRoutesByPath, TFilePath> =
  FileRouteEntry<TFileRoutesByPath, TFilePath> extends {
    parentRoute: infer TParentRoute extends AnyRoute
  }
    ? TParentRoute
    : never
type FileRouteId<TFileRoutesByPath, TFilePath> =
  FileRouteEntry<TFileRoutesByPath, TFilePath> extends {
    id: infer TId extends string
  }
    ? TId
    : never
type FileRoutePath<TFileRoutesByPath, TFilePath> =
  FileRouteEntry<TFileRoutesByPath, TFilePath> extends {
    path: infer TPath extends string
  }
    ? TPath
    : never
type FileRouteFullPath<TFileRoutesByPath, TFilePath> =
  FileRouteEntry<TFileRoutesByPath, TFilePath> extends {
    fullPath: infer TFullPath extends string
  }
    ? TFullPath
    : never

/**
 * Route factories of a route module, typed against the module's generated
 * `FileRoutesByPath` and its scope register instead of the application's
 * global registrations.
 */
export interface FileRouteScope<
  TFileRoutesByPath,
  TRegister,
  TModuleId extends string,
> {
  /** `createFileRoute`, typed against the module's own route files. */
  createFileRoute: <TFilePath extends keyof TFileRoutesByPath & string>(
    path?: TFilePath,
  ) => FileRouteFactory<
    FileRouteId<TFileRoutesByPath, TFilePath>,
    FileRouteParent<TFileRoutesByPath, TFilePath>,
    FileRouteId<TFileRoutesByPath, TFilePath>,
    FileRoutePath<TFileRoutesByPath, TFilePath>,
    FileRouteFullPath<TFileRoutesByPath, TFilePath>,
    TRegister
  >
  /**
   * Creates the module root. `TRouterContext` is the router context the module
   * requires from the route it is mounted under.
   */
  createModuleRoot: <TRouterContext = {}>() => <
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TSearchValidator = undefined,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TSSR = unknown,
    const TServerMiddlewares = unknown,
    THandlers = undefined,
  >(
    options?: ModuleRootRouteOptions<
      TModuleId,
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
  ) => ModuleRootRoute<
    TModuleId,
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
  >
}

/** Binds only the module-root factory used by generated route scopes. */
export function bindCreateModuleRoot<TRegister, TModuleId extends string>(
  moduleId: TModuleId,
): FileRouteScope<never, TRegister, TModuleId>['createModuleRoot'] {
  // Module routes resolve their route-bound APIs through the core's
  // route-module behavior: install it with the first module root.
  installRouteModules()
  return () => (options) =>
    new Route({ ...(options as any), _module: moduleId }) as any
}

/**
 * The routing APIs of a route scope, typed against `TRouter`.
 *
 * Path-based APIs (`Link`, `useNavigate`, `redirect`, ...) address routes by
 * the module-local paths of the module: they work wherever the module is
 * mounted. Id-based APIs (`useMatch`, `getRouteApi`, ...) take qualified route
 * ids such as `@acme/products:/$productId`.
 */
export interface RouteScope<TRouter extends AnyRouter> {
  Link: LinkComponent<'a', string, { router: TRouter }>
  createLink: CreateLinkFn<{ router: TRouter }>
  linkOptions: LinkOptionsFn<'a', { router: TRouter }>
  Navigate: NavigateComponentFn<{ router: TRouter }>
  useNavigate: UseNavigateFn<{ router: TRouter }>
  useLinkProps: UseLinkPropsFn<{ router: TRouter }>
  useBlocker: UseBlockerFn<{ router: TRouter }>
  notFound: (
    options?: Omit<NotFoundError, 'routeId'> & {
      routeId?: RouteIds<TRouter['routeTree']>
    },
  ) => NotFoundError
  redirect: RedirectFn<{ router: TRouter }>
  MatchRoute: MatchRouteFn<{ router: TRouter }>
  useMatchRoute: UseMatchRouteFn<{ router: TRouter }>
  /**
   * The router, viewed from the module: its `navigate`, `buildLocation`,
   * `preloadRoute` and `matchRoute` take module-local paths.
   */
  useRouter: (opts?: { warn?: boolean }) => ScopedRouterView<TRouter>
  getRouteApi: GetRouteApiFn<{ router: TRouter }>
  useMatch: UseMatchFn<{ router: TRouter }>
  useMatches: UseMatchesFn<{ router: TRouter }>
  useParentMatches: UseParentMatchesFn<{ router: TRouter }>
  useChildMatches: UseChildMatchesFn<{ router: TRouter }>
  useLoaderData: UseLoaderDataFn<{ router: TRouter }>
  useLoaderDeps: UseLoaderDepsFn<{ router: TRouter }>
  useSearch: UseSearchFn<{ router: TRouter }>
  useParams: UseParamsFn<{ router: TRouter }>
  useRouteContext: UseRouteContextFn<{ router: TRouter }>
  useLocation: UseLocationFn<{ router: TRouter }>
  useRouterState: UseRouterStateFn<{ router: TRouter }>
}

// Each generated ESM export binds only its own API. These functions allocate
// closures/components; they never access a router or register runtime state.
function useBoundOptions(moduleId: string): (options: any) => any {
  const router = useRouter()
  const routeId = React.useContext(matchContext)
  return React.useCallback(
    (options: any) =>
      bindRouteScopeOptions(moduleId, options ?? {}, router, routeId),
    [moduleId, router, routeId],
  )
}

function bindIdHook(moduleId: string, hook: (options: any) => any) {
  const toInstallation = getInstallationRouteIdMapper(moduleId)
  return toInstallation
    ? (options?: { from?: string }) =>
        hook({ ...options, from: toInstallation(options?.from) })
    : hook
}

export function bindRouteScopeLink<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['Link'] {
  const AnyLink = Link as React.ComponentType<any>
  return React.forwardRef<Element, any>((props, ref) => {
    const bind = useBoundOptions(moduleId)
    return <AnyLink {...bind(props)} ref={ref} />
  }) as any
}

export function bindRouteScopeCreateLink<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['createLink'] {
  const AnyLink = Link as React.ComponentType<any>
  return ((Comp: unknown) =>
    React.forwardRef<Element, any>((props, ref) => {
      const bind = useBoundOptions(moduleId)
      return <AnyLink {...bind(props)} _asChild={Comp} ref={ref} />
    })) as any
}

export function bindRouteScopeNavigate<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['Navigate'] {
  const AnyNavigate = Navigate as React.ComponentType<any>
  return function ScopedNavigate(props: object) {
    const bind = useBoundOptions(moduleId)
    return <AnyNavigate {...bind(props)} />
  } as any
}

export function bindRouteScopeMatchRoute<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['MatchRoute'] {
  const AnyMatchRoute = MatchRoute as React.ComponentType<any>
  return function ScopedMatchRoute(props: object) {
    const bind = useBoundOptions(moduleId)
    const routeId = React.useContext(matchContext)
    return <AnyMatchRoute {...bind(props)} _nearestRoute={routeId} />
  } as any
}

export function bindRouteScopeUseLinkProps<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useLinkProps'] {
  return function useScopedLinkProps(
    options: any,
    ref: React.ForwardedRef<Element>,
  ) {
    return useLinkProps(useBoundOptions(moduleId)(options), ref)
  } as any
}

export function bindRouteScopeLinkOptions<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['linkOptions'] {
  return ((options: any) =>
    Array.isArray(options)
      ? options.map((option) => bindRouteScopeOptions(moduleId, option))
      : bindRouteScopeOptions(moduleId, options)) as any
}

export function bindRouteScopeUseNavigate<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useNavigate'] {
  return function useScopedNavigate(options?: any) {
    const bind = useBoundOptions(moduleId)
    const navigate = useNavigate(bind(options))
    return React.useCallback(
      (next: any) => navigate(bind(next)),
      [navigate, bind],
    )
  } as any
}

export function bindRouteScopeRedirect<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['redirect'] {
  return createScopedRedirect<TRouter>(moduleId)
}

export function bindRouteScopeUseMatchRoute<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useMatchRoute'] {
  return function useScopedMatchRoute() {
    const bind = useBoundOptions(moduleId)
    const matchRoute = useMatchRoute()
    const routeId = React.useContext(matchContext)
    return React.useCallback(
      (options: any) =>
        matchRoute({ ...bind(options), _nearestRoute: routeId }),
      [matchRoute, bind, routeId],
    )
  } as any
}

export function bindRouteScopeUseRouter<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useRouter'] {
  return function useScopedRouter(options?: { warn?: boolean }) {
    return getScopedRouterView(
      useRouter(options),
      moduleId,
      React.useContext(matchContext),
    )
  } as any
}

export function bindRouteScopeGetRouteApi<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['getRouteApi'] {
  const toInstallation = getInstallationRouteIdMapper(moduleId)
  return (
    toInstallation
      ? (id: string) => getRouteApi(toInstallation(id) as never)
      : getRouteApi
  ) as any
}

export function bindRouteScopeUseMatch<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useMatch'] {
  return bindIdHook(moduleId, useMatch) as any
}

export function bindRouteScopeUseLoaderData<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useLoaderData'] {
  return bindIdHook(moduleId, useLoaderData) as any
}

export function bindRouteScopeUseLoaderDeps<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useLoaderDeps'] {
  return bindIdHook(moduleId, useLoaderDeps) as any
}

export function bindRouteScopeUseSearch<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useSearch'] {
  return bindIdHook(moduleId, useSearch) as any
}

export function bindRouteScopeUseParams<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useParams'] {
  return bindIdHook(moduleId, useParams) as any
}

export function bindRouteScopeUseRouteContext<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useRouteContext'] {
  return bindIdHook(moduleId, useRouteContext) as any
}

export function bindRouteScopeNotFound<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['notFound'] {
  const toInstallation = getInstallationRouteIdMapper(moduleId)
  return ((options?: any) =>
    notFound(
      toInstallation && options?.routeId
        ? { ...options, routeId: toInstallation(options.routeId) }
        : options,
    )) as any
}
