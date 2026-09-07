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

  // The router initializes the original module export after its first import.
  // Retain that export across HMR so updates can find its owning router.
  return [
    template.statement(
      `
if (import.meta.hot) {
  const hot = import.meta.hot
  const hotData = hot.data ??= {}
  const previousRoute = hotData['tsr-route']
  hotData['tsr-route'] = Route
  const handleRouteUpdate = ${handleRouteUpdateCode}
  const initialRouteId = ${routeIdFallback} ?? hotData['tsr-route-id']
  if (initialRouteId) {
    hotData['tsr-route-id'] = initialRouteId
  }
  if (previousRoute && initialRouteId && previousRoute !== Route) {
    handleRouteUpdate(initialRouteId, Route, previousRoute)
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
      handleRouteUpdate(routeId, newModule.Route, Route)
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
