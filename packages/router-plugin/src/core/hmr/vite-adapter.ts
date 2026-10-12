import * as template from '@babel/template'
import { getHandleRouteUpdateCode } from './handle-route-update'
import type * as t from '@babel/types'

/**
 * Emits HMR accept code for Vite / native ESM HMR: `import.meta.hot.accept`
 * with a callback that receives the freshly re-imported module.
 *
 * `targetFramework` is currently unused — Vite's framework-specific fast-refresh
 * plugins handle component body patching via their own accept boundaries — but
 * we take it for API symmetry with `createWebpackHmrStatement`.
 */
export function createViteHmrStatement(
  stableRouteOptionKeys: Array<string>,
  opts: {
    routeId?: string
  } = {},
): Array<t.Statement> {
  const handleRouteUpdateCode = getHandleRouteUpdateCode(stableRouteOptionKeys)
  // The replacement Route object can be uninitialized; keep a generated id as
  // fallback for the existing router route we need to patch.
  const routeIdFallback =
    typeof opts.routeId === 'string' ? JSON.stringify(opts.routeId) : 'Route.id'

  // The router holds the `Route` this module exported first, so only that
  // route may be patched. Matching by id alone would also patch a route from
  // another module, e.g. a Module Federation remote whose `__root__` or `/`
  // shares an id with the host's.
  return [
    template.statement(
      `
if (import.meta.hot) {
  const hot = import.meta.hot
  const hotData = hot.data ??= {}
  const handleRouteUpdate = ${handleRouteUpdateCode}
  hotData['tsr-route'] ??= Route
  const isOwnRoute = (routeId) =>
    typeof window !== 'undefined' &&
    window.__TSR_ROUTER__?.routesById?.[routeId] === hotData['tsr-route']
  const initialRouteId = ${routeIdFallback} ?? hotData['tsr-route-id']
  if (initialRouteId) {
    hotData['tsr-route-id'] = initialRouteId
  }
  if (initialRouteId && hotData['tsr-route'] !== Route && isOwnRoute(initialRouteId)) {
    handleRouteUpdate(initialRouteId, Route)
    hotData['tsr-route-update-handled'] = Route
  }
  hot.accept((newModule) => {
    if (Route && newModule && newModule.Route) {
      const routeId = hotData['tsr-route-id'] ?? ${routeIdFallback}
      if (routeId) {
        hotData['tsr-route-id'] = routeId
      }
      if (hotData['tsr-route-update-handled'] === newModule.Route) {
        delete hotData['tsr-route-update-handled']
        return
      }
      if (isOwnRoute(routeId)) {
        handleRouteUpdate(routeId, newModule.Route)
      }
    }
    })
}
`,
      {
        syntacticPlaceholders: true,
      },
    )(),
  ]
}
