import path from 'node:path'
import * as t from '@babel/types'
import { generateFromAst, logDiff, parseAst } from '@tanstack/router-utils'
import { normalizePath } from 'vite'
import { deadCodeElimination } from 'babel-dead-code-elimination'
import { debug } from '../debug'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import type { Plugin } from 'vite'
import type { Config } from '@tanstack/router-generator'

/**
 * This removes the server part from the generated route tree so that it can be used on the client.
 */
export function routeTreeClientPlugin(config: Config): Plugin {
  const generatedRouteTreePath = normalizePath(
    path.resolve(config.generatedRouteTree),
  )

  return {
    name: 'tanstack-start:route-tree-client-plugin',
    enforce: 'pre',
    // only run this plugin in the client environment
    applyToEnvironment: (env) => env.name === VITE_ENVIRONMENT_NAMES.client,
    transform: {
      filter: { id: generatedRouteTreePath },
      handler(code, id) {
        if (id !== generatedRouteTreePath) {
          return null
        }
        if (debug) console.info(`Compiling route tree for the client`, id)
        const ast = parseAst({ code, sourceFilename: id })

        // only keep `export const routeTree = ...  `
        const filteredBody = ast.program.body.filter((node) => {
          if (t.isExportNamedDeclaration(node)) {
            if (
              node.declaration &&
              t.isVariableDeclaration(node.declaration) &&
              node.declaration.declarations.length === 1 &&
              node.declaration.declarations[0] &&
              t.isVariableDeclarator(node.declaration.declarations[0]) &&
              t.isIdentifier(node.declaration.declarations[0].id) &&
              node.declaration.declarations[0].id.name === 'routeTree'
            ) {
              return true
            }
            return false
          }
          // strip off the typescript interface & module declarations since they also reference the server routes
          if (
            t.isTSInterfaceDeclaration(node) ||
            t.isTSModuleDeclaration(node)
          ) {
            return false
          }
          return true
        })

        ast.program.body = filteredBody

        deadCodeElimination(ast)

        const compiled = generateFromAst(ast, {
          sourceMaps: true,
          sourceFileName: id,
          filename: id,
        })
        if (debug) {
          logDiff(code, compiled.code)
          console.log('Output:\n', compiled.code, '\n\n')
        }

        return compiled
      },
    },
  }
}
