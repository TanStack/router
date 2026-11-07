import type { AnyRouter, BuildNextOptions } from './router'

/**
 * The route-module behavior of the core. Route-module code installs it
 * (`installRouteModules`) when a module root is created or mounted, before an
 * application creates its router; applications without route modules never
 * assign `routeModules`, so bundlers drop every branch that reads it.
 */
export interface RouteModuleBehavior {
  /**
   * The id of a route module's root (`<moduleId>:`, from its `_module`
   * option), which qualifies the ids of its subtree such as
   * `@acme/products:/$productId` wherever the module is mounted; `undefined`
   * for every other route.
   */
  rootId: (options: { _module?: string } | undefined) => string | undefined
  /**
   * Resolves the id of the route whose matches the caller reads. Route modules
   * address their routes by module-local ids such as `@acme/settings:/profile`;
   * when the route tree installs the module several times, such an id resolves
   * to the route of the installation of the caller's nearest match
   * (`nearestRouteId`). Every other id is returned as it is.
   */
  resolveRouteId: (
    router: AnyRouter,
    routeId: string,
    nearestRouteId: string | undefined,
  ) => string
  /**
   * Translates the module-local options of route-module APIs (`_module`,
   * `_fromRoute`, `_nearestRoute`) into application options.
   */
  scopeLocation: <TOptions extends BuildNextOptions>(
    router: AnyRouter,
    opts: TOptions,
  ) => TOptions
  /**
   * The navigation scope of a route's route-bound APIs (`redirect`,
   * `useNavigate`, `Link`). A route-module route resolves absolute
   * destinations in its module and takes `from` from its current full path,
   * which depends on the mount; it returns `undefined` for application routes,
   * which keep `from`.
   */
  navigationScope: (
    routeId: string,
  ) => { from: undefined; _module: string; _fromRoute: string } | undefined
}

/**
 * Installed before the first render and never removed, so framework hooks may
 * branch on it statically, like on `isServer`.
 */
export let routeModules: RouteModuleBehavior | undefined

export function installRouteModuleBehavior(
  behavior: RouteModuleBehavior,
): void {
  routeModules = behavior
}
