import { astTemplate, hole, importMeta, literal } from '../ast-template'
import { createHandleRouteUpdate } from './handle-route-update'
import type { AnyRoute } from '@tanstack/router-core'
import type { HandleRouteUpdate } from './handle-route-update'
import type { ProgramStatement } from '@yuku-toolchain/types'

/** The route module's route */
declare const Route: AnyRoute

const viteRouteHmr = astTemplate(
  {
    handleRouteUpdateFunction: hole.expression<HandleRouteUpdate>(),
    routeIdFallback: hole.expression<string | undefined>(),
  },
  ({ handleRouteUpdateFunction, routeIdFallback }) => {
    if (importMeta.hot) {
      const hot = importMeta.hot
      const hotData = (hot.data ??= {})
      const handleRouteUpdate = handleRouteUpdateFunction
      const initialRouteId = routeIdFallback ?? hotData['tsr-route-id']
      if (initialRouteId) {
        hotData['tsr-route-id'] = initialRouteId
      }
      const existingRoute =
        typeof window !== 'undefined' && initialRouteId
          ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            window.__TSR_ROUTER__?.routesById?.[initialRouteId]
          : undefined
      if (initialRouteId && existingRoute && existingRoute !== Route) {
        handleRouteUpdate(initialRouteId, Route)
        hotData['tsr-route-update-handled'] = Route
      }
      hot.accept((newModule) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (Route && newModule?.Route) {
          const routeId = hotData['tsr-route-id'] ?? routeIdFallback
          if (routeId) {
            hotData['tsr-route-id'] = routeId
          }
          if (hotData['tsr-route-update-handled'] === newModule.Route) {
            delete hotData['tsr-route-update-handled']
            return
          }
          handleRouteUpdate(routeId!, newModule.Route)
        }
      })
    }
  },
)

const routeIdExpression = astTemplate({}, () => Route.id)

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
): Array<ProgramStatement> {
  return viteRouteHmr({
    handleRouteUpdateFunction: createHandleRouteUpdate(stableRouteOptionKeys),
    // The replacement Route object can be uninitialized; keep a generated id
    // as fallback for the existing router route we need to patch.
    routeIdFallback:
      typeof opts.routeId === 'string'
        ? literal(opts.routeId)
        : routeIdExpression(),
  })
}
