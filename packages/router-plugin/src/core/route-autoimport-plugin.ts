import { generateFromAst, logDiff, parseAst } from '@tanstack/router-utils'
import { getConfig } from './config'
import { debug, fileIsInRoutesDirectory } from './utils'
import type { Config } from './config'
import type { UnpluginFactory } from 'unplugin'

import babel from '@babel/core'
import * as template from '@babel/template'


/**
 * This plugin adds imports for createFileRoute and createLazyFileRoute to the file route.
 */
export const unpluginRouteAutoimportFactory: UnpluginFactory<
    Partial<Config> | undefined
> = (options = {}) => {
    let ROOT: string = process.cwd()
    let userConfig = options as Config

    const routerImportPath = `@tanstack/${userConfig.target}-router`
    const autoImports = {
        createFileRoute: template.statement(
            `import { createFileRoute } from '${routerImportPath}'`,
        )(),
        createLazyFileRoute: template.statement(
            `import { createLazyFileRoute } from '${routerImportPath}'`,
        )()
    }

    return {
        name: 'router-autoimport-plugin',
        enforce: 'pre',

        transform(code, id) {
            let routeType: 'createFileRoute' | 'createLazyFileRoute' | undefined = undefined
            if (code.includes('export const Route = createFileRoute(')) {
                routeType = 'createFileRoute'
            } else if (code.includes('export const Route = createLazyFileRoute(')) {
                routeType = 'createLazyFileRoute'
            }
            if (!routeType) {
                return null
            }

            if (debug) console.info('Adding autoimports to route ', id)

            const ast = parseAst({ code })

            let isCreateRouteFunctionImported = false;

            babel.traverse(ast, {
                Program: {
                    enter(programPath) {
                        programPath.traverse({
                            ImportDeclaration(path) {
                                const importedSpecifiers = path.node.specifiers.map(
                                    (specifier) => specifier.local.name
                                );
                                if (
                                    importedSpecifiers.includes(routeType) &&
                                    path.node.source.value === routerImportPath
                                ) {
                                    isCreateRouteFunctionImported = true;
                                }
                            },
                        });
                    },
                },
            });

            if (!isCreateRouteFunctionImported) {
                ast.program.body.unshift(autoImports[routeType]);
            }

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
