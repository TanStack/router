import { generateFromAst, logDiff, parseAst } from '@tanstack/router-utils'
import { getConfig } from './config'
import { routeHmrStatement } from './route-hmr-statement'
import { debug, fileIsInRoutesDirectory } from './utils'
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
    name: 'router-hmr-plugin',
    enforce: 'pre',

    transform(code, id) {
      if (!code.includes('export const Route = createFileRoute(')) {
        return null
      }

      if (debug) console.info('Adding HMR handling to route ', id)

      const ast = parseAst({ code, filename: id, root: ROOT })
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

    transformInclude(id) {
      return fileIsInRoutesDirectory(id, userConfig.routesDirectory)
    },

    vite: {
      configResolved(config) {
        ROOT = config.root
        config.mode

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
