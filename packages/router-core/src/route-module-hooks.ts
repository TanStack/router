import type { AnyRouter, BuildNextOptions } from './router'

// Route-module behavior of the core. Route-module code installs these hooks
// (`installRouteModuleHooks`); applications without route modules never
// assign them, so bundlers drop every branch that reads them.

/**
 * Resolves the id of the route whose matches the caller reads. Route modules
 * address their routes by module-local ids such as `@acme/settings:/profile`;
 * when the route tree installs the module several times, such an id resolves
 * to the route of the installation of the caller's nearest match
 * (`nearestRouteId`). Every other id is returned as it is.
 */
export let resolveRouteId:
  | ((
      router: AnyRouter,
      routeId: string,
      nearestRouteId: string | undefined,
    ) => string)
  | undefined

/**
 * Translates the module-local options of route-module APIs (`_module`,
 * `_fromRoute`, `_nearestRoute`) into application options.
 */
export let scopeLocationOptions:
  | (<TOptions extends BuildNextOptions>(
      router: AnyRouter,
      opts: TOptions,
    ) => TOptions)
  | undefined

/**
 * The navigation scope of a route's route-bound APIs (`redirect`,
 * `useNavigate`, `Link`). A route-module route resolves absolute destinations
 * in its module and takes `from` from its current full path, which depends on
 * the mount; it returns `undefined` for application routes, which keep `from`.
 */
export let getRouteNavigationScope:
  | ((
      routeId: string,
    ) => { from: undefined; _module: string; _fromRoute: string } | undefined)
  | undefined

/**
 * The id of a route module's root (`<moduleId>:`, from its `_module` option),
 * which qualifies the ids of its subtree such as `@acme/products:/$productId`
 * wherever the module is mounted; `undefined` for every other route.
 */
export let getModuleRootId:
  | ((options: { _module?: string } | undefined) => string | undefined)
  | undefined

/**
 * Called by route-module code before it creates module roots or
 * module-local options. Positional, so installing allocates nothing.
 */
export function installRouteModuleHooks(
  resolve: NonNullable<typeof resolveRouteId>,
  scope: NonNullable<typeof scopeLocationOptions>,
  navigationScope: NonNullable<typeof getRouteNavigationScope>,
  moduleRootId: NonNullable<typeof getModuleRootId>,
): void {
  resolveRouteId = resolve
  scopeLocationOptions = scope
  getRouteNavigationScope = navigationScope
  getModuleRootId = moduleRootId
}
