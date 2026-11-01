import type { AnyRouter } from './router'

/**
 * Resolves the id of the route whose matches the caller reads. Route modules
 * address their routes by module-local ids such as `@acme/settings:/profile`;
 * when the route tree installs the module several times, such an id resolves
 * to the route of the installation of the caller's nearest match
 * (`nearestRouteId`). Every other id is returned as it is.
 *
 * `mountRouteModule` installs it. It stays `undefined` in applications
 * without route modules, so their bundles drop the code that resolves ids.
 * Used by the framework bindings and route loading.
 */
export let resolveRouteId:
  | ((
      router: AnyRouter,
      routeId: string,
      nearestRouteId: string | undefined,
    ) => string)
  | undefined

/** Called by `mountRouteModule`. */
export function setResolveRouteId(
  resolve: NonNullable<typeof resolveRouteId>,
): void {
  resolveRouteId = resolve
}
