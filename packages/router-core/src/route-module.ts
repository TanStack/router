import { invariant } from './invariant'
import { redirect } from './redirect'
import { rootRouteId } from './root'
import { installRouteModuleHooks } from './route-module-hooks'
import type { RedirectFn } from './redirect'
import type { BuildLocationFn, NavigateFn } from './RouterProvider'
import type { AnyContext, AnyRoute, Route, RouteOptions } from './route'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RegisteredSsr,
  RouterCore,
} from './router'
import type { ParseRoute } from './routeInfo'
import type {
  RegisteredSSROption,
  ValidateSerializableInput,
} from './ssr/serializer/transformer'
import type { LooseReturnType } from './utils'

/**
 * The router a route scope is typed against.
 *
 * A scope register (`{ router: TRouter }`) selects its router. Any other
 * register, including `unknown` from code-based routes, falls back to the
 * application's registered router.
 */
export type RegisteredRouterOf<TRegister> = TRegister extends {
  router: infer TRouter extends AnyRouter
}
  ? TRouter
  : RegisteredRouter<Register>

/**
 * The router type of a route scope: the router of a route tree that contains
 * the scope's routes, typed independently of the application that mounts it.
 */
export type ScopeRouter<
  TRouteTree extends AnyRoute,
  TModuleId extends string = string,
> = RouterCore<TRouteTree & RouteScopeMarker<TModuleId>, 'never', false>

declare const routeScopeMarker: unique symbol

/** Internal generated/framework wiring: An erased distinction between a provider scope and a host router. */
export interface RouteScopeMarker<TModuleId extends string = string> {
  [routeScopeMarker]: TModuleId
}

/** Internal generated/framework wiring: Selects an installation without changing the provider's route types. */
export type ScopedRouter<TRouter extends AnyRouter, TModuleId extends string> =
  Omit<
    TRouter['routeTree'],
    typeof routeScopeMarker
  > extends infer TTree extends AnyRoute
    ? ScopeRouter<TTree, TModuleId> &
        Pick<TRouter, Exclude<keyof TRouter, keyof AnyRouter>>
    : never

/** Internal generated/framework wiring: The scope stamp accepted by a destination's consuming API. */
export type CompatibleRouteScope<TRouter extends AnyRouter> =
  TRouter['routeTree'] extends RouteScopeMarker<infer TModuleId>
    ? TModuleId extends `${infer TModule}#${string}`
      ? TModuleId | TModule
      : TModuleId | `${TModuleId}#${string}`
    : string

/** Internal generated/framework wiring: A receiver constraint is deferred only until an origin is available. */
export type RouteModuleScope<TModuleId extends string = string> =
  | TModuleId
  | {
      receiver: TModuleId
      target: TModuleId
    }

type BoundScope<TModuleId extends string, TOptions> = TOptions extends {
  _module: infer TScope
}
  ? TScope extends { receiver: string; target: string }
    ? TScope
    : TScope extends `${string}#${string}`
      ? TModuleId extends `${string}#${string}`
        ? TModuleId
        : { receiver: TModuleId; target: TScope }
      : TModuleId
  : TModuleId

/** Internal generated/framework wiring: Preserve scope identity through reusable options and spreads. */
export type ScopedRouteOptions<TOptions, TRouter extends AnyRouter> =
  TRouter['routeTree'] extends RouteScopeMarker<infer TModuleId>
    ? TOptions extends ReadonlyArray<unknown>
      ? {
          [TKey in keyof TOptions]: ScopedRouteOptions<TOptions[TKey], TRouter>
        }
      : Omit<TOptions, '_module'> & {
          readonly _module: BoundScope<TModuleId, TOptions>
        }
    : TOptions

/**
 * The router of a route module as seen from where it is mounted: links into
 * the module also take the path params of the routes above it (`THostParams`).
 * Code inside the module uses its own router, which never has them.
 */
export type HostedRouter<TRouter extends AnyRouter, THostParams> = TRouter & {
  '~hostParams': THostParams
}

/**
 * Application route maps cannot infer final paths from a provider's local
 * templates. Keep own identity and data precise; raw parent/child links point
 * into the application graph rather than the provider's template graph.
 */
export type MountedRoutesById<TRoutesById> = {
  [TId in keyof TRoutesById]: TRoutesById[TId] extends {
    types: infer TTypes
    options: infer TOptions
  }
    ? Omit<
        TRoutesById[TId],
        | 'path'
        | 'fullPath'
        | 'to'
        | 'parentRoute'
        | 'children'
        | 'options'
        | 'types'
      > & {
        readonly path: string | undefined
        readonly fullPath: string
        readonly to: string
        parentRoute: AnyRoute
        children?: Array<AnyRoute>
        options: Omit<TOptions, 'path' | 'getParentRoute'> & {
          path: string | undefined
          getParentRoute: () => AnyRoute
        }
        types: Omit<
          TTypes,
          'path' | 'fullPath' | 'to' | 'parentRoute' | 'children'
        > & {
          path: string | undefined
          fullPath: string
          to: string
          parentRoute: AnyRoute
          children: Array<AnyRoute> | undefined
        }
      }
    : TRoutesById[TId]
}

/**
 * The routes of one installation of a route module installed several times,
 * by id: `<moduleId>#<as>:/…` for each `<moduleId>:/…` of `TRoutesById`.
 */
export type InstallationRoutesById<
  TRoutesById,
  TModuleId extends string,
  TAs extends string,
> = {
  [TId in keyof TRoutesById as TId extends `${TModuleId}:${infer TPath}`
    ? `${TModuleId}#${TAs}:${TPath}`
    : TId]: TId extends `${TModuleId}:${infer TPath}`
    ? InstallationRoute<TRoutesById[TId], `${TModuleId}#${TAs}:${TPath}`>
    : TRoutesById[TId]
}

type InstallationRoute<TRoute, TId extends string> = TRoute extends {
  types: infer TTypes
}
  ? Omit<TRoute, 'id' | 'types'> & {
      readonly id: TId
      types: Omit<TTypes, 'id'> & { id: TId }
    }
  : TRoute

/**
 * Options of a route module's root route (`createModuleRoot`).
 *
 * The root has no path or id of its own: the module id determines its id and
 * the including route tree chooses where it is mounted.
 */
export interface ModuleRootRouteOptions<
  TModuleId extends string,
  TRegister,
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
> extends Omit<
  RouteOptions<
    TRegister,
    any, // TParentRoute: provided by the including tree
    `${TModuleId}:`, // TId
    `${TModuleId}:`, // TCustomId
    '/', // TFullPath: module-local
    '/', // TPath
    TSearchValidator,
    {}, // TParams
    TLoaderDeps,
    TLoaderFn,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TSSR,
    TServerMiddlewares,
    THandlers
  >,
  | 'path'
  | 'id'
  | 'getParentRoute'
  | 'caseSensitive'
  | 'parseParams'
  | 'stringifyParams'
  | 'params'
  | '_module'
  | '_uses'
> {}

/**
 * The root route of a route module. Its router context (`TRouterContext`) is
 * the context the module requires from the route it is mounted under.
 */
export type ModuleRootRoute<
  TModuleId extends string,
  TRegister,
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
  TFileRouteTypes = unknown,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
> = Route<
  TRegister,
  any, // TParentRoute
  '/', // TPath
  '/', // TFullPath
  `${TModuleId}:`, // TCustomId
  `${TModuleId}:`, // TId
  TSearchValidator,
  {}, // TParams
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
>

/**
 * Returns the id of the route module that owns a route, or `undefined` for
 * routes that do not belong to a route module.
 *
 * Route-module routes have qualified ids such as `@acme/products:/$productId`;
 * the module root's id is `@acme/products:`. Package names cannot contain
 * `:`, and application route ids start with `/` (or are `__root__`).
 */
export function getRouteModuleId(routeId: string): string | undefined {
  const index = routeId.indexOf(':')
  return index > 0 && routeId[0] !== '/' ? routeId.slice(0, index) : undefined
}

/**
 * The route ids of a namespace of one installation of a module installed
 * several times (`<moduleId>#<as>`): the namespace takes the module's own
 * ids (`<moduleId>:/…`) and addresses the routes of its installation.
 * Returns `undefined` for the namespace of a module installed once.
 */
export function getInstallationRouteIdMapper(
  namespaceId: string,
): (<T>(routeId: T) => T) | undefined {
  const separator = namespaceId.indexOf('#')
  if (separator < 0) {
    return undefined
  }
  const prefix = `${namespaceId.slice(0, separator)}:`
  return (routeId) =>
    typeof routeId === 'string' && routeId.startsWith(prefix)
      ? ((namespaceId + routeId.slice(separator)) as typeof routeId)
      : routeId
}

/**
 * The navigation scope of a route-module route: its route-bound APIs resolve
 * absolute destinations in the module and take `from` from the route's
 * current full path, which depends on the mount.
 */
function getModuleNavigationScope(routeId: string) {
  const moduleId = getRouteModuleId(routeId)
  return moduleId === undefined
    ? undefined
    : { from: undefined, _module: moduleId, _fromRoute: routeId }
}

/** The id of a module root: `<moduleId>:` (see `getModuleRootId`). */
function getModuleRootId(options: { _module?: string } | undefined) {
  return options?._module === undefined ? undefined : `${options._module}:`
}

/**
 * Installs the route-module behavior of the core. Route-module code calls it
 * before it creates module roots or module-local options, so applications
 * without route modules never ship that behavior.
 */
export function installRouteModules(): void {
  installRouteModuleHooks(
    resolveModuleRouteId,
    scopeLocationOptions,
    getModuleNavigationScope,
    getModuleRootId,
  )
}

type MissingKeys<THave, TNeed> = Exclude<keyof TNeed, keyof THave> & string

type RouteModuleName<TRoot extends AnyRoute> =
  TRoot['id'] extends `${infer TModuleId}:` ? TModuleId : TRoot['id']

/**
 * Validates the mount path of a route module: it must be static, since links
 * into the module could not provide path params of the mount path.
 */
export type ValidateRouteModuleMountPath<
  TRoot extends AnyRoute,
  TAt extends string,
> = TAt extends `${string}$${string}`
  ? `Route module '${RouteModuleName<TRoot>}' must be mounted at a static path without path params`
  : TAt

type ValidateMountSearch<
  TRoot extends AnyRoute,
  TParent extends AnyRoute,
> = {} extends TParent['types']['fullSearchSchemaInput']
  ? {}
  : {
      '~mountSearchError': `Route module '${RouteModuleName<TRoot>}' cannot be mounted under '${TParent['id']}', which requires search params. Links into the module could not provide them.`
    }

type ValidateMountContext<
  TRoot extends AnyRoute,
  TParent extends AnyRoute,
> = TParent['types']['allContext'] extends TRoot['types']['routerContext']
  ? {}
  : {
      '~mountContextError': [
        MissingKeys<
          TParent['types']['allContext'],
          TRoot['types']['routerContext']
        >,
      ] extends [never]
        ? `Route module '${RouteModuleName<TRoot>}' requires router context that '${TParent['id']}' does not provide with compatible types`
        : `Route module '${RouteModuleName<TRoot>}' requires router context '${MissingKeys<
            TParent['types']['allContext'],
            TRoot['types']['routerContext']
          >}' that '${TParent['id']}' does not provide`
    }

type ModuleParamKeys<TRoot extends AnyRoute> =
  ParseRoute<TRoot> extends infer TRoute
    ? TRoute extends AnyRoute
      ? keyof TRoute['types']['params']
      : never
    : never

type ConflictingHostParams<
  TRoot extends AnyRoute,
  TParent extends AnyRoute,
> = Extract<keyof TParent['types']['allParams'], ModuleParamKeys<TRoot>> &
  string

type ValidateMountParams<TRoot extends AnyRoute, TParent extends AnyRoute> = [
  ConflictingHostParams<TRoot, TParent>,
] extends [never]
  ? {}
  : {
      '~mountParamsError': `Route module '${RouteModuleName<TRoot>}' cannot be mounted under '${TParent['id']}' because its routes overwrite host params '${ConflictingHostParams<TRoot, TParent>}'`
    }

type IsSerializableResult<T> = [T] extends [
  ValidateSerializableInput<Register, T>,
]
  ? true
  : false

/** The ids of a module's server-rendered routes with unserializable results. */
type UnserializableRouteIds<TRoot extends AnyRoute> =
  ParseRoute<TRoot> extends infer TRoute
    ? TRoute extends AnyRoute
      ? TRoute['types']['allSsr'] extends false
        ? never
        : IsSerializableResult<TRoute['types']['loaderData']> extends false
          ? TRoute['id']
          : IsSerializableResult<
                LooseReturnType<TRoute['types']['beforeLoadFn']>
              > extends false
            ? TRoute['id']
            : never
      : never
    : never

/**
 * In a server-rendering application (`Register['ssr']`), the loader and
 * `beforeLoad` results of a module's server-rendered routes are serialized
 * with the application's serialization adapters. The module is typed without
 * them, so the mount checks every route.
 */
type ValidateMountLifecycle<TRoot extends AnyRoute> =
  false extends RegisteredSsr<Register>
    ? {}
    : RegisteredSSROption<Register> extends false
      ? {}
      : [UnserializableRouteIds<TRoot>] extends [never]
        ? {}
        : {
            '~mountSerializationError': `Route module '${RouteModuleName<TRoot>}' returns loader or beforeLoad results from '${UnserializableRouteIds<TRoot> & string}' that the application cannot serialize`
          }

/**
 * Validates that a route module can be mounted under `TParent`.
 *
 * A module is checked against its own module-local types. Path params of the
 * host chain carry over into the module's own links, and links from where the
 * module is mounted pass them (`HostedRouter`). Required search params would
 * not carry over, so the host chain must not have any. The host must provide
 * the router context the module root requires, and a server-rendering
 * application must be able to serialize the module's lifecycle results.
 */
export type ValidateRouteModuleMount<
  TRoot extends AnyRoute,
  TParent extends AnyRoute,
> = ValidateMountSearch<TRoot, TParent> &
  ValidateMountContext<TRoot, TParent> &
  ValidateMountParams<TRoot, TParent> &
  ValidateMountLifecycle<TRoot>

export interface MountRouteModuleOptions<
  TRoot extends AnyRoute,
  TParent extends AnyRoute,
  TAt extends string,
> {
  /**
   * The host route the module root is mounted under. It must satisfy the
   * module's requirements (see `ValidateRouteModuleMount`).
   */
  // Validating on this property instead of the options object keeps the
  // inference of `TAt` precise.
  parent: (() => TParent) & ValidateRouteModuleMount<TRoot, TParent>
  /**
   * The static path of the module root relative to `parent`. Omit it (or use
   * `'/'`) to mount the module without a path segment.
   */
  at?: ValidateRouteModuleMountPath<TRoot, TAt>
  /**
   * The name of this installation when the route tree installs the module
   * several times. The installation gets copies of the module's routes with
   * ids `<moduleId>#<as>:/…`; module code keeps addressing them by its own
   * ids, which resolve to the installation it renders under.
   */
  as?: string
  /**
   * The installations of modules installed several times that this
   * installation links to, keyed by module id.
   */
  uses?: Record<string, string>
}

/**
 * Resolves a module-local route id of a module installed several times
 * (`@acme/settings:/profile`) to the route of an installation
 * (`@acme/settings#orgSettings:/profile`): the installation of the caller's
 * nearest match, or the installation its module uses (`uses`). A route tree
 * never matches two installations of one module at once, so the caller's
 * match chain determines the installation. Every other id, including those of
 * the router's routes, is returned as it is.
 */
function resolveModuleRouteId(
  router: AnyRouter,
  routeId: string,
  nearestRouteId: string | undefined,
): string {
  const index = routeId.indexOf(':')
  const nearestIndex = nearestRouteId?.indexOf(':') ?? -1
  if (
    router.routesById[routeId] ||
    index <= 0 ||
    routeId[0] === '/' ||
    nearestIndex <= 0 ||
    nearestRouteId![0] === '/'
  ) {
    return routeId
  }
  const moduleId = routeId.slice(0, index)
  const caller = nearestRouteId!.slice(0, nearestIndex)
  const installation = caller.startsWith(`${moduleId}#`)
    ? caller
    : (router.routesById[`${caller}:`] as AnyRoute | undefined)?.options
        ._uses?.[moduleId]
  return installation === undefined
    ? routeId
    : installation + routeId.slice(index)
}

/**
 * Resolves the internal route-module options of a location build:
 * - `_module`: absolute `to`/`from` (and mask `to`/`from`) are local to the
 *   module whose root has the id `<_module>:`;
 * - `_fromRoute`: without an explicit `from`, resolve from the current full
 *   path of the route with this id;
 * - `_nearestRoute`: both resolve to the installation of the caller (see
 *   `resolveModuleRouteId`).
 */
function scopeLocationOptions<
  TOptions extends {
    to?: unknown
    from?: string
    mask?: { to?: unknown; from?: string; _module?: RouteModuleScope }
    _module?: RouteModuleScope
    _fromRoute?: string
    _nearestRoute?: string
  },
>(router: AnyRouter, opts: TOptions): TOptions {
  // Only called with `_module` set (see `RouterCore.buildLocation`); module
  // routes and scoped APIs, which create such options, installed it.
  // Route/RouteApi consumers retain their authored origin even when reusable
  // options supply a destination stamp.
  if (opts._fromRoute) {
    const index = opts._fromRoute.indexOf(':')
    if (index > 0 && opts._fromRoute[0] !== '/') {
      opts = bindRouteScopeOptions(
        opts._fromRoute.slice(0, index),
        opts,
        router,
        opts._nearestRoute,
      ) as TOptions
    }
  }
  const moduleId =
    typeof opts._module === 'object'
      ? resolveRouteScopeConstraint(router, opts._module, opts._nearestRoute)
      : opts._module
  const rootId = resolveModuleRouteId(
    router,
    `${moduleId}:`,
    opts._nearestRoute,
  )
  const root = router.routesById[rootId] as AnyRoute | undefined
  if (!root) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        Object.keys(router.routesById).some((id) =>
          id.startsWith(`${moduleId}#`),
        )
          ? `Invariant failed: Route module "${moduleId}" is installed several times in this router. Address one installation through its namespace.`
          : `Invariant failed: Route module "${moduleId}" is not installed in this router. Mount it with mountRouteModule() in the route tree of the app.`,
      )
    }
    invariant()
  }
  if (opts.mask?._module !== undefined) {
    bindRouteScopeOptions(
      rootId.slice(0, -1),
      opts.mask,
      router,
      opts._nearestRoute,
    )
  }
  const prefix = root.fullPath === '/' ? '' : root.fullPath
  const localize = <T>(path: T): T =>
    prefix && typeof path === 'string' && path[0] === '/'
      ? ((prefix + path) as T)
      : path
  return {
    ...opts,
    to: localize(opts.to),
    from:
      opts.from === undefined && opts._fromRoute !== undefined
        ? (
            router.routesById[
              resolveModuleRouteId(router, opts._fromRoute, opts._nearestRoute)
            ] as AnyRoute | undefined
          )?.fullPath
        : localize(opts.from),
    mask: opts.mask && {
      ...opts.mask,
      to: localize(opts.mask.to),
      from: localize(opts.mask.from),
    },
  }
}

/**
 * Mounts a route module's root under a host route.
 *
 * Generated route trees call this for every installed module. The module's
 * routes keep their qualified ids; their paths become the mount path followed
 * by their module-local paths. A module installed several times is mounted
 * once per installation (`as`): each installation gets its own copies of the
 * module's routes, and the module's route objects stay templates with their
 * module-local ids and paths.
 *
 * @experimental Route modules are experimental and may change in any release.
 */
export function mountRouteModule<
  TRoot extends AnyRoute,
  TParent extends AnyRoute,
  const TAt extends string = '/',
>(root: TRoot, options: MountRouteModuleOptions<TRoot, TParent, TAt>): TRoot {
  const moduleId = root.options._module
  if (moduleId === undefined) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'Invariant failed: mountRouteModule() expects the root route of a route module, created with createModuleRoot().',
      )
    }
    invariant()
  }
  const at = options.at
  const mount = {
    getParentRoute: options.parent,
    path: at && at !== '/' ? at : undefined,
    _uses: options.uses,
  }
  installRouteModules()
  if (options.as === undefined) {
    root.update(mount as any)
    ;(root as { isRoot: boolean }).isRoot = false
    return root
  }
  if (root.id === undefined) {
    initTemplates(root, () => templateHost)
  }
  return copyRoute(root, {
    ...mount,
    _module: `${moduleId}#${options.as}`,
  }) as TRoot
}

/**
 * The stand-in parent of an unmounted module root: module code addresses the
 * module's routes by their module-local ids and paths.
 */
const templateHost = { id: rootRouteId, fullPath: '/' } as AnyRoute

function initTemplates(route: AnyRoute, getParentRoute: () => AnyRoute) {
  route.update({ getParentRoute } as any)
  route.init(0)
  route.children?.forEach((child: AnyRoute) =>
    initTemplates(child, () => route),
  )
}

/**
 * Copies a module route and its subtree for one installation. Copies share
 * the template's options, so components, loaders and code-split chunks are
 * the same for every installation; `lazyFn` loads into each copy.
 */
function copyRoute(template: AnyRoute, options: object): AnyRoute {
  const copy = new (template.constructor as new () => AnyRoute)()
  copy.options = { ...template.options, ...options }
  ;(copy as { isRoot: boolean }).isRoot = false
  copy.lazyFn = template.lazyFn
  ;(copy as { _template?: AnyRoute })._template = template
  copy.children = template.children?.map((child: AnyRoute) =>
    copyRoute(child, { getParentRoute: () => copy }),
  )
  return copy
}

function assertRouteScope(
  compatible: boolean,
  incoming: string,
  moduleId: string,
) {
  if (!compatible) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        `Cannot use route scope "${incoming}" options in route scope "${moduleId}".`,
      )
    }
    invariant()
  }
}

function resolveRouteScopeConstraint(
  router: AnyRouter,
  scope: { receiver: string; target: string },
  nearestRouteId?: string,
): string {
  assertRouteScope(
    resolveModuleRouteId(router, `${scope.receiver}:`, nearestRouteId) ===
      `${scope.target}:`,
    scope.target,
    scope.receiver,
  )
  return scope.target
}

/** Internal generated/framework wiring: Bind options without silently replacing an incompatible scope. */
export function bindRouteScopeOptions<T extends { _module?: RouteModuleScope }>(
  moduleId: string,
  options: T,
  router?: AnyRouter,
  nearestRouteId?: string,
): Omit<T, '_module'> & { _module: RouteModuleScope } {
  installRouteModules()
  let scope = options._module
  if (typeof scope === 'object' && router) {
    const target = resolveRouteScopeConstraint(
      router,
      scope,
      moduleId.includes('#') ? `${moduleId}:` : nearestRouteId,
    )
    // The deferred receiver is already this API's scope, so the resolved
    // constraint has also established its installation ownership.
    if (scope.receiver === moduleId) {
      return { ...options, _module: target }
    }
    scope = target
  }
  const incoming = typeof scope === 'object' ? scope.target : scope
  if (incoming && incoming !== moduleId) {
    const incomingInstallation = incoming.indexOf('#')
    const installation = moduleId.indexOf('#')
    assertRouteScope(
      incomingInstallation < 0
        ? moduleId.startsWith(`${incoming}#`)
        : installation < 0 && incoming.startsWith(`${moduleId}#`),
      incoming,
      moduleId,
    )
    if (incomingInstallation >= 0) {
      scope = { receiver: moduleId, target: incoming }
      if (router) {
        scope = resolveRouteScopeConstraint(router, scope, nearestRouteId)
      }
    }
  }
  return {
    ...options,
    _module:
      typeof scope === 'object'
        ? scope
        : incoming?.includes('#')
          ? incoming
          : moduleId,
  }
}

/**
 * Creates the `redirect` of a route module: absolute destinations are local to
 * the module, wherever it is mounted.
 */
export function createScopedRedirect<TRouter extends AnyRouter>(
  moduleId: string,
): RedirectFn<{ router: TRouter }> {
  return (opts) => redirect(bindRouteScopeOptions(moduleId, opts) as any) as any
}

/**
 * The router as seen from a route module: `navigate` and `buildLocation` take
 * the module's local paths and are typed against the module router
 * (`TRouter`). `preloadRoute` and `matchRoute` are already typed by the route
 * tree of `TRouter`.
 */
export type ScopedRouterView<TRouter extends AnyRouter> = Omit<
  TRouter,
  'navigate' | 'buildLocation' | 'routeTree' | 'routesById' | 'routesByPath'
> & {
  navigate: NavigateFn<{ router: TRouter }>
  buildLocation: BuildLocationFn<{ router: TRouter }>
  /** Raw application routes retain their final installed IDs and paths. */
  routeTree: AnyRoute
  routesById: Record<string, AnyRoute | undefined>
  routesByPath: Record<string, AnyRoute | undefined>
}

const scopedRouterViews = new WeakMap<AnyRouter, Record<string, AnyRouter>>()

/**
 * Returns a view of `router` whose path-based navigation methods address the
 * routes of a route module in module-local coordinates. Everything else is
 * read from the router itself. A module installed several times is addressed
 * in the installation of the caller's nearest match (`nearestRouteId`).
 */
export function getScopedRouterView<TRouter extends AnyRouter>(
  router: AnyRouter,
  moduleId: string,
  nearestRouteId?: string,
): ScopedRouterView<TRouter> {
  const namespace = resolveModuleRouteId(
    router,
    `${moduleId}:`,
    nearestRouteId,
  ).slice(0, -1)
  let views = scopedRouterViews.get(router)
  if (!views) {
    views = Object.create(null) as Record<string, AnyRouter>
    scopedRouterViews.set(router, views)
  }
  return (views[namespace] ??= createScopedRouterView(router, namespace)) as any
}

function createScopedRouterView(
  router: AnyRouter,
  moduleId: string,
): AnyRouter {
  const view: AnyRouter = Object.create(router)
  view.navigate = (opts: any) =>
    router.navigate(bindRouteScopeOptions(moduleId, opts, router))
  view.buildLocation = (opts: any) =>
    router.buildLocation(bindRouteScopeOptions(moduleId, opts, router))
  view.preloadRoute = (opts: any) =>
    router.preloadRoute(bindRouteScopeOptions(moduleId, opts, router) as any)
  view.matchRoute = (location: any, opts: any) =>
    router.matchRoute(bindRouteScopeOptions(moduleId, location, router), opts)
  return view
}
