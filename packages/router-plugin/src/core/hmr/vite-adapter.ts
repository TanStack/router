import * as template from '@babel/template'
import { getHandleRouteUpdateCode } from './handle-route-update'
import type { Config } from '../config'
import type * as t from '@babel/types'

/**
 * Emits HMR accept code for Vite / native ESM HMR: `import.meta.hot.accept`
 * with a callback that receives the freshly re-imported module.
 *
 * Framework-specific component runtimes still own component body patching.
 * The route signature only suppresses a redundant data invalidation when an
 * Octane update changed extracted component code but not the route definition.
 */
export function createViteHmrStatement(
  stableRouteOptionKeys: Array<string>,
  opts: {
    targetFramework: Config['target']
    routeId?: string
    routeSignature?: string
  },
): Array<t.Statement> {
  const handleRouteUpdateCode = getHandleRouteUpdateCode(stableRouteOptionKeys)
  // The replacement Route object can be uninitialized; keep a generated id as
  // fallback for the existing router route we need to patch.
  const routeIdFallback =
    typeof opts.routeId === 'string' ? JSON.stringify(opts.routeId) : 'Route.id'
  const routeSignature =
    typeof opts.routeSignature === 'string'
      ? JSON.stringify(opts.routeSignature)
      : 'undefined'
  const shouldInvalidateCurrentRoute =
    opts.targetFramework === 'octane'
      ? `typeof routeSignature !== 'string' || previousRouteSignature !== routeSignature`
      : 'true'
  const shouldInvalidateNextRoute =
    opts.targetFramework === 'octane'
      ? `typeof routeSignature !== 'string' || nextRouteSignature !== routeSignature`
      : 'true'

  return [
    template.statement(
      `
if (import.meta.hot) {
  const hot = import.meta.hot
  const hotData = hot.data ??= {}
  const handleRouteUpdate = ${handleRouteUpdateCode}
  const routeSignatureKey = Symbol.for('tanstack.router.hmr.route-signature')
  const routeSignature = ${routeSignature}
  const previousRouteSignature = hotData['tsr-route-signature']
  const shouldInvalidateCurrentRoute = ${shouldInvalidateCurrentRoute}
  Route[routeSignatureKey] = routeSignature
  hotData['tsr-route-signature'] = routeSignature
  const initialRouteId = ${routeIdFallback} ?? hotData['tsr-route-id']
  if (initialRouteId) {
    hotData['tsr-route-id'] = initialRouteId
  }
  const existingRoute =
    typeof window !== 'undefined' && initialRouteId
      ? window.__TSR_ROUTER__?.routesById?.[initialRouteId]
      : undefined
  if (initialRouteId && existingRoute && existingRoute !== Route) {
    handleRouteUpdate(initialRouteId, Route, shouldInvalidateCurrentRoute)
    hotData['tsr-route-update-handled'] = Route
  }
  import.meta.hot.accept((newModule) => {
    if (Route && newModule && newModule.Route) {
      const routeId = hotData['tsr-route-id'] ?? ${routeIdFallback}
      if (routeId) {
        hotData['tsr-route-id'] = routeId
      }
      if (hotData['tsr-route-update-handled'] === newModule.Route) {
        delete hotData['tsr-route-update-handled']
        return
      }
      const nextRouteSignature = newModule.Route[routeSignatureKey]
      const shouldInvalidateNextRoute = ${shouldInvalidateNextRoute}
      handleRouteUpdate(routeId, newModule.Route, shouldInvalidateNextRoute)
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
