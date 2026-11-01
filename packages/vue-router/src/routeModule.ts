import * as Vue from 'vue'
import { notFound } from '@tanstack/router-core'
import {
  bindRouteScopeOptions,
  createScopedRedirect,
  getInstallationRouteIdMapper,
  getScopedRouterView,
} from '@tanstack/router-core/_internal/route-module'
import { Route, getRouteApi } from './route'
import { Link, useLinkPropsImpl } from './link'
import { useBlocker } from './useBlocker'
import { Navigate, useNavigate } from './useNavigate'
import {
  MatchRoute,
  useChildMatches,
  useMatchRoute,
  useMatches,
  useParentMatches,
} from './Matches'
import { useRouter } from './useRouter'
import { routeIdContext } from './matchContext'
import { useMatch } from './useMatch'
import { useLoaderData } from './useLoaderData'
import { useLoaderDeps } from './useLoaderDeps'
import { useSearch } from './useSearch'
import { useParams } from './useParams'
import { useRouteContext } from './useRouteContext'
import { useLocation } from './useLocation'
import { useRouterState } from './useRouterState'
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
  MatchRouteComponentType,
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
  MatchRoute: MatchRouteComponentType<{ router: TRouter }>
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
function bindOptions(moduleId: string): (options: any) => any {
  const router = useRouter()
  const routeId = Vue.inject(routeIdContext, undefined)
  return (options: any) =>
    bindRouteScopeOptions(moduleId, options ?? {}, router, routeId)
}

function bindIdHook(moduleId: string, hook: (options: any) => any) {
  const toInstallation = getInstallationRouteIdMapper(moduleId)
  return toInstallation
    ? (options?: { from?: string }) =>
        hook({ ...options, from: toInstallation(options?.from) })
    : hook
}

function scopedComponent(
  moduleId: string,
  name: string,
  component: any,
  extra?: object,
) {
  return Vue.defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const bind = bindOptions(moduleId)
      return () => Vue.h(component, { ...bind(attrs), ...extra }, slots)
    },
  })
}

export function bindRouteScopeLink<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['Link'] {
  return scopedComponent(moduleId, 'Link', Link) as any
}

export function bindRouteScopeCreateLink<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['createLink'] {
  return ((Comp: unknown) =>
    scopedComponent(moduleId, 'Link', Link, { _asChild: Comp })) as any
}

export function bindRouteScopeNavigate<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['Navigate'] {
  return scopedComponent(moduleId, 'Navigate', Navigate) as any
}

export function bindRouteScopeMatchRoute<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['MatchRoute'] {
  return Vue.defineComponent({
    name: 'MatchRoute',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const bind = bindOptions(moduleId)
      const routeId = Vue.inject(routeIdContext, undefined)
      return () =>
        Vue.h(
          MatchRoute as any,
          { ...bind(attrs), _nearestRoute: routeId },
          slots,
        )
    },
  }) as any
}

export function bindRouteScopeUseLinkProps<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useLinkProps'] {
  return ((options: any) => {
    const bind = bindOptions(moduleId)
    return useLinkPropsImpl(() => bind(options))
  }) as any
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
  return ((options?: any) => {
    const bind = bindOptions(moduleId)
    const navigate = useNavigate(bind(options))
    return (next: any) => navigate(bind(next))
  }) as any
}

export function bindRouteScopeRedirect<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['redirect'] {
  return createScopedRedirect<TRouter>(moduleId)
}

export function bindRouteScopeUseMatchRoute<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useMatchRoute'] {
  return (() => {
    const bind = bindOptions(moduleId)
    const matchRoute = useMatchRoute()
    const routeId = Vue.inject(routeIdContext, undefined)
    return (options: any) =>
      matchRoute({ ...bind(options), _nearestRoute: routeId })
  }) as any
}

export function bindRouteScopeUseRouter<TRouter extends AnyRouter>(
  moduleId: string,
): RouteScope<TRouter>['useRouter'] {
  return ((options?: { warn?: boolean }) =>
    getScopedRouterView(
      useRouter(options),
      moduleId,
      Vue.inject(routeIdContext, undefined),
    )) as any
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

export function bindRouteScopeUseMatches<TRouter extends AnyRouter>(
  _moduleId: string,
): RouteScope<TRouter>['useMatches'] {
  return useMatches as any
}

export function bindRouteScopeUseParentMatches<TRouter extends AnyRouter>(
  _moduleId: string,
): RouteScope<TRouter>['useParentMatches'] {
  return useParentMatches as any
}

export function bindRouteScopeUseChildMatches<TRouter extends AnyRouter>(
  _moduleId: string,
): RouteScope<TRouter>['useChildMatches'] {
  return useChildMatches as any
}

export function bindRouteScopeUseLocation<TRouter extends AnyRouter>(
  _moduleId: string,
): RouteScope<TRouter>['useLocation'] {
  return useLocation as any
}

export function bindRouteScopeUseRouterState<TRouter extends AnyRouter>(
  _moduleId: string,
): RouteScope<TRouter>['useRouterState'] {
  return useRouterState as any
}

export function bindRouteScopeUseBlocker<TRouter extends AnyRouter>(
  _moduleId: string,
): RouteScope<TRouter>['useBlocker'] {
  return useBlocker as any
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
