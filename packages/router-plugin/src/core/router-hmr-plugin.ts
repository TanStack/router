import { generateFromAst, logDiff, parseAst } from '@tanstack/router-utils'
import { routeHmrStatement } from './route-hmr-statement'
import { debug } from './utils'
import type { Config } from './config'
import type { UnpluginFactory } from 'unplugin'

/**
 * This plugin adds HMR support for file routes.
 * It is only added to the composed plugin in dev when autoCodeSplitting is disabled, since the code splitting plugin
 * handles HMR for code-split routes itself.
 */
export const unpluginRouterHmrFactory: UnpluginFactory<
  Partial<Config> | undefined
> = () => {
  return {
    name: 'tanstack-router:hmr',
    enforce: 'pre',
    transform: {
      filter: {
        // this is necessary for webpack / rspack to avoid matching .html files
        id: /\.(m|c)?(j|t)sx?$/,
        code: 'createFileRoute(',
      },
      handler(code, id) {
        if (!globalThis.TSR_ROUTES_BY_ID_MAP?.has(id)) {
          return null
        }

        if (debug) console.info('Adding HMR handling to route ', id)

        const ast = parseAst({ code })
        ast.program.body.push(routeHmrStatement)
        const result = generateFromAst(ast, {
          sourceMaps: true,
          filename: id,
          sourceFileName: id,
        })
        if (debug) {
          logDiff(code, result.code)
          console.log('Output:\n', result.code + '\n\n')
        }
        return result
      },
    },
  }
}
