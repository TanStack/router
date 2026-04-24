import * as template from '@babel/template'
import { getHandleRouteUpdateCode } from './handle-route-update'
import type { Config } from '../config'
import type * as t from '@babel/types'

/**
 * Emits HMR accept code for bundlers with webpack-compatible `module.hot`
 * semantics (classic webpack via `import.meta.webpackHot`, and Rspack).
 *
 * Unlike Vite's `hot.accept((newModule) => {...})` — where the callback receives
 * the freshly re-imported module — webpack re-executes the module factory on
 * accept, so our HMR logic must live at module top level and read the previous
 * `routeId` out of `hot.data`. `hot.dispose` stashes it for the next run, and
 * `hot.accept()` (no callback) enrolls us as a self-accepting boundary.
 *
 * Returns an array of statements so that for React we can prepend an
 * `import { performReactRefresh } from 'react-refresh/runtime'` hoisted to the
 * top of the module.
 */
export function createWebpackHmrStatement(
  stableRouteOptionKeys: Array<string>,
  opts: {
    targetFramework: Config['target']
    routeId?: string
  },
): Array<t.Statement> {
  const handleRouteUpdateCode = getHandleRouteUpdateCode(stableRouteOptionKeys)
  const staticRouteIdLiteral =
    typeof opts.routeId === 'string'
      ? JSON.stringify(opts.routeId)
      : 'undefined'

  const statements: Array<t.Statement> = []

  // React-only: route modules aren't React Refresh "boundaries" (they export
  // a non-component `Route`), so the bundler's react-refresh runtime won't
  // call `performReactRefresh` for us. We kick it manually after swapping
  // route options so newly-registered component bodies get patched into live
  // fibers.
  //
  // We import `performReactRefresh` directly from `react-refresh/runtime` —
  // the canonical public API — rather than relying on the ProvidePlugin-
  // injected `__react_refresh_utils__` global, whose name is an internal
  // detail of `@rspack/plugin-react-refresh`. The rspack plugin aliases
  // `react-refresh` → its bundled runtime (getRefreshRuntimeDirPath), so this
  // resolves to the same singleton the plugin itself uses and shares the
  // registry React was patched against.
  //
  // Use the same delayed refresh style as Rspack's React Refresh runtime.
  // Route modules and their split component chunks can arrive in separate HMR
  // steps under CI load; a microtask can run before the split chunk registers
  // its new component family, causing the refresh to no-op or remount.
  //
  // For non-React frameworks we skip this entirely.
  const reactRefreshCall =
    opts.targetFramework === 'react'
      ? `
    const tsrRefreshState = globalThis.__TSR_HMR__ ??= {}
    try {
      if (!tsrRefreshState.refreshScheduled) {
        tsrRefreshState.refreshScheduled = true
        setTimeout(() => {
          tsrRefreshState.refreshScheduled = false
          try { __tsr_performReactRefresh() } catch (_e) { /* noop */ }
        }, 30)
      }
    } catch (_err) { /* noop */ }`
      : ''

  if (opts.targetFramework === 'react') {
    statements.push(
      template.statement(
        `import { performReactRefresh as __tsr_performReactRefresh } from 'react-refresh/runtime'`,
      )(),
    )
  }

  statements.push(
    template.statement(
      `
if (import.meta.webpackHot) {
  const hot = import.meta.webpackHot
  const hotData = hot.data ??= {}
  const routeId = hotData['tsr-route-id'] ?? Route.id ?? (Route.isRoot ? '__root__' : ${staticRouteIdLiteral})
  if (routeId) {
    hotData['tsr-route-id'] = routeId
  }
  const existingRoute =
    typeof window !== 'undefined' && routeId
      ? window.__TSR_ROUTER__?.routesById?.[routeId]
      : undefined
  if (routeId && existingRoute && existingRoute !== Route) {
    (${handleRouteUpdateCode})(routeId, Route)${reactRefreshCall}
  }
  hot.dispose((data) => {
    if (routeId) {
      data['tsr-route-id'] = routeId
    }
  })
  hot.accept()
}
`,
      {
        syntacticPlaceholders: true,
      },
    )(),
  )

  return statements
}
