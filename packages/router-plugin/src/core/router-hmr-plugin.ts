import { generateFromAst, logDiff, parseAst } from '@tanstack/router-utils'
import { getConfig } from './config'
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
> = (options = {}) => {
  let ROOT: string = process.cwd()
  let userConfig = options as Config

  return {
    name: 'tanstack-router:hmr',
    enforce: 'pre',

    transform: {
      filter: {
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

    vite: {
      configResolved(config) {
        ROOT = config.root
        userConfig = getConfig(options, ROOT)
      },
    },

    rspack() {
      ROOT = process.cwd()
      userConfig = getConfig(options, ROOT)
    },

    webpack() {
      ROOT = process.cwd()
      userConfig = getConfig(options, ROOT)
    },
  }
}
