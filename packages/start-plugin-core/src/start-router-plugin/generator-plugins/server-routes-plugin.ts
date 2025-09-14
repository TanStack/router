import {
  checkRouteFullPathUniqueness,
  ensureStringArgument,
  hasChildWithExport,
} from '@tanstack/router-generator'

import type {
  GeneratorPluginWithTransform,
  ImportDeclaration,
  TransformImportsConfig,
} from '@tanstack/router-generator'

const EXPORT_NAME = 'ServerRoute'
export function serverRoutesPlugin(): GeneratorPluginWithTransform {
  return {
    name: 'server-routes-plugin',
    transformPlugin: {
      name: 'server-routes-transform',
      exportName: EXPORT_NAME,
      imports: (ctx) => {
        const targetModule = `@tanstack/${ctx.target}-start/server`
        const imports: TransformImportsConfig = {}
        if (ctx.verboseFileRoutes === false) {
          imports.banned = [
            {
              source: targetModule,
              specifiers: [{ imported: 'createServerFileRoute' }],
            },
          ]
        } else {
          imports.required = [
            {
              source: targetModule,
              specifiers: [{ imported: 'createServerFileRoute' }],
            },
          ]
        }
        return imports
      },
      onExportFound: ({ ctx, decl }) => {
        let appliedChanges = false
        if (decl.init?.type === 'CallExpression') {
          let call = decl.init
          let callee = call.callee

          while (
            callee.type === 'MemberExpression' &&
            callee.object.type === 'CallExpression'
          ) {
            call = callee.object
            callee = call.callee
          }
          if (
            call.callee.type === 'Identifier' &&
            call.callee.name === 'createServerFileRoute'
          ) {
            if (!ctx.verboseFileRoutes) {
              if (call.arguments.length) {
                call.arguments = []
                appliedChanges = true
              }
            } else {
              appliedChanges = ensureStringArgument(
                call,
                ctx.routeId,
                ctx.preferredQuote,
              )
            }
          } else {
            throw new Error(
              `Expected "createServerFileRoute" call, but got "${call.callee.type}"`,
            )
          }
        }
        return appliedChanges
      },
    },
    moduleAugmentation: ({ generator }) => ({
      module: `@tanstack/${generator.config.target}-start/server`,
      interfaceName: 'ServerFileRoutesByPath',
    }),
    onRouteTreesChanged: ({ routeTrees, generator }) => {
      const tree = routeTrees.find((tree) => tree.exportName === EXPORT_NAME)
      if (tree) {
        checkRouteFullPathUniqueness(tree.sortedRouteNodes, generator.config)
      }
    },
    imports: (ctx) => {
      const imports: Array<ImportDeclaration> = []

      const targetModule = `@tanstack/${ctx.generator.config.target}-start/server`
      if (ctx.generator.config.verboseFileRoutes === false) {
        imports.push({
          specifiers: [
            { imported: 'CreateServerFileRoute' },
            { imported: 'ServerFileRoutesByPath' },
          ],
          source: targetModule,
          importKind: 'type',
        })
      }
      // don't add the import if there are no server routes defined
      const hasMatchingRouteFiles = ctx.acc.routeNodes.length > 0
      if (hasMatchingRouteFiles) {
        // needs a virtual root route
        if (!ctx.rootRouteNode.exports?.includes(EXPORT_NAME)) {
          imports.push({
            specifiers: [{ imported: 'createServerRootRoute' }],
            source: targetModule,
          })
        }
      }
      return imports
    },
    routeModuleAugmentation: ({ routeNode }) => {
      // server routes don't support lazy routes
      if (routeNode._fsRouteType === 'lazy') {
        return undefined
      }
      return `const createServerFileRoute: CreateServerFileRoute<
          ServerFileRoutesByPath['${routeNode.routePath}']['parentRoute'],
          ServerFileRoutesByPath['${routeNode.routePath}']['id'],
          ServerFileRoutesByPath['${routeNode.routePath}']['path'],
          ServerFileRoutesByPath['${routeNode.routePath}']['fullPath'],
          ${hasChildWithExport(routeNode, 'ServerRoute') ? `${routeNode.variableName}ServerRouteChildren` : 'unknown'}
        >`
    },
    createRootRouteCode: () => `createServerRootRoute()`,
    createVirtualRouteCode: ({ node }) =>
      `createServerFileRoute('${node.routePath}')`,
    config: ({ sortedRouteNodes }) => {
      const hasMatchingRouteFiles = sortedRouteNodes.length > 0
      return {
        virtualRootRoute: hasMatchingRouteFiles,
      }
    },
  }
}
