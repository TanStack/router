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
): Array<t.Statement> {
  const handleRouteUpdateCode = getHandleRouteUpdateCode(stableRouteOptionKeys)

  return [
    template.statement(
      `
if (import.meta.hot) {
  const hot = import.meta.hot
  const hotData = hot.data ??= {}
  hot.accept((newModule) => {
    if (Route && newModule && newModule.Route) {
      const routeId = hotData['tsr-route-id'] ?? Route.id
      if (routeId) {
        hotData['tsr-route-id'] = routeId
      }
      (${handleRouteUpdateCode})(routeId, newModule.Route)
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
