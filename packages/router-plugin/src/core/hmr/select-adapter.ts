import { createViteHmrStatement } from './vite-adapter'
import { createWebpackHmrStatement } from './webpack-adapter'
import type { Config } from '../config'
import type * as t from '@babel/types'

/**
 * The HMR runtime to emit code for:
 * - `'vite'`: ESM `import.meta.hot` with Vite accept-callback semantics.
 * - `'webpack'`: `import.meta.webpackHot` with webpack / Rspack `module.hot`
 *   re-execution semantics.
 */
export type HmrStyle = 'vite' | 'webpack'

export type CreateRouteHmrStatementOpts = {
  hmrStyle: HmrStyle
  targetFramework: Config['target']
  routeId?: string
}

/**
 * Dispatches to the HMR adapter of the bundler the plugin runs in. `hmrStyle`
 * comes from the bundler-specific plugin entry (e.g. `rspack.ts` →
 * `'webpack'`), not from user config.
 */
export function createRouteHmrStatement(
  stableRouteOptionKeys: Array<string>,
  opts: CreateRouteHmrStatementOpts,
): Array<t.Statement> {
  const routeId = opts.routeId === '/__root' ? '__root__' : opts.routeId

  if (opts.hmrStyle === 'webpack') {
    return createWebpackHmrStatement(stableRouteOptionKeys, {
      targetFramework: opts.targetFramework,
      routeId,
    })
  }
  return createViteHmrStatement(stableRouteOptionKeys, {
    routeId,
  })
}
