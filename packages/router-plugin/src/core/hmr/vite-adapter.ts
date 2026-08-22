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

  // `hot.data` persists across re-evaluations of this module but starts empty
  // on the very first import. The eager patch below (which mirrors the live
  // route's generated state onto this module's `Route` export, see #4303)
  // must therefore only run on a hot re-evaluation: on a first import, a
  // same-id route found on `window.__TSR_ROUTER__` belongs to a *different*
  // router living in the same window (e.g. a module-federation host/remote
  // pair), and patching it would graft foreign route options and components
  // across the two apps (#7921).
  return [
    template.statement(
      `
if (import.meta.hot) {
  const hot = import.meta.hot
  const hotData = hot.data ??= {}
  const handleRouteUpdate = ${handleRouteUpdateCode}
  const initialRouteId = ${routeIdFallback} ?? hotData['tsr-route-id']
  if (initialRouteId) {
    hotData['tsr-route-id'] = initialRouteId
  }
  const isHotReevaluation = hotData['tsr-route-initialized'] === true
  hotData['tsr-route-initialized'] = true
  const existingRoute =
    isHotReevaluation && typeof window !== 'undefined' && initialRouteId
      ? window.__TSR_ROUTER__?.routesById?.[initialRouteId]
      : undefined
  if (initialRouteId && existingRoute && existingRoute !== Route) {
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
      handleRouteUpdate(routeId, newModule.Route)
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
