import { generateFromAst, logDiff, parseAst } from '@tanstack/router-utils'
import babel from '@babel/core'
import * as template from '@babel/template'
import { getConfig } from './config'
import { debug } from './utils'
import type { Config } from './config'
import type { UnpluginFactory } from 'unplugin'

/**
 * This plugin adds imports for createFileRoute and createLazyFileRoute to the file route.
 */
export const unpluginRouteAutoImportFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}) => {
  let ROOT: string = process.cwd()
  let userConfig = options as Config

  return {
    name: 'tanstack-router:autoimport',
    enforce: 'pre',

    transform: {
      filter: {
        // this is necessary for webpack / rspack to avoid matching .html files
        id: /\.(m|c)?(j|t)sx?$/,
        code: /createFileRoute\(|createLazyFileRoute\(/,
      },
      handler(code, id) {
        if (!globalThis.TSR_ROUTES_BY_ID_MAP?.has(id)) {
          return null
        }
        let routeType: 'createFileRoute' | 'createLazyFileRoute'
        if (code.includes('createFileRoute(')) {
          routeType = 'createFileRoute'
        } else if (code.includes('createLazyFileRoute(')) {
          routeType = 'createLazyFileRoute'
        } else {
          return null
        }

        const routerImportPath = `@tanstack/${userConfig.target}-router`

        const ast = parseAst({ code })

        let isCreateRouteFunctionImported = false as boolean

        babel.traverse(ast, {
          Program: {
            enter(programPath) {
              programPath.traverse({
                ImportDeclaration(path) {
                  const importedSpecifiers = path.node.specifiers.map(
                    (specifier) => specifier.local.name,
                  )
                  if (
                    importedSpecifiers.includes(routeType) &&
                    path.node.source.value === routerImportPath
                  ) {
                    isCreateRouteFunctionImported = true
                  }
                },
              })
            },
          },
        })

        if (!isCreateRouteFunctionImported) {
          if (debug) console.info('Adding autoimports to route ', id)

          const autoImportStatement = template.statement(
            `import { ${routeType} } from '${routerImportPath}'`,
          )()
          ast.program.body.unshift(autoImportStatement)

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
        }

        return null
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
