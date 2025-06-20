import { defaultTransformPlugin } from '../transform/default-transform-plugin'
import {
  checkRouteFullPathUniqueness,
  isRouteNodeValidForAugmentation,
} from '../utils'
import type { ImportDeclaration } from '../types'
import type { GeneratorPluginWithTransform } from './types'

const EXPORT_NAME = 'Route'
export function defaultGeneratorPlugin(): GeneratorPluginWithTransform {
  return {
    name: 'default',
    transformPlugin: defaultTransformPlugin,
    imports: (opts) => {
      const imports: Array<ImportDeclaration> = []
      if (opts.acc.routeNodes.some((n) => n.isVirtual)) {
        imports.push({
          specifiers: [{ imported: 'createFileRoute' }],
          source: opts.generator.targetTemplate.fullPkg,
        })
      }
      if (opts.generator.config.verboseFileRoutes === false) {
        const typeImport: ImportDeclaration = {
          specifiers: [],
          source: opts.generator.targetTemplate.fullPkg,
          importKind: 'type',
        }
        if (
          opts.sortedRouteNodes.some(
            (d) =>
              isRouteNodeValidForAugmentation(d) && d._fsRouteType !== 'lazy',
          )
        ) {
          typeImport.specifiers.push({ imported: 'CreateFileRoute' })
        }
        if (
          opts.sortedRouteNodes.some(
            (node) =>
              opts.acc.routePiecesByPath[node.routePath!]?.lazy &&
              isRouteNodeValidForAugmentation(node),
          )
        ) {
          typeImport.specifiers.push({ imported: 'CreateLazyFileRoute' })
        }

        if (typeImport.specifiers.length > 0) {
          typeImport.specifiers.push({ imported: 'FileRoutesByPath' })
          imports.push(typeImport)
        }
      }
      const hasMatchingRouteFiles = opts.acc.routeNodes.length > 0
      if (hasMatchingRouteFiles) {
        // needs a virtual root route
        if (!opts.rootRouteNode.exports?.includes(EXPORT_NAME)) {
          imports.push({
            specifiers: [{ imported: 'createRootRoute' }],
            source: opts.generator.targetTemplate.fullPkg,
          })
        }
      }
      return imports
    },
    moduleAugmentation: ({ generator }) => ({
      module: generator.targetTemplate.fullPkg,
      interfaceName: 'FileRoutesByPath',
    }),
    onRouteTreesChanged: ({ routeTrees, generator }) => {
      const routeTree = routeTrees.find(
        (tree) => tree.exportName === EXPORT_NAME,
      )
      if (!routeTree) {
        throw new Error(
          'No route tree found with export name "Route". Please ensure your routes are correctly defined.',
        )
      }
      checkRouteFullPathUniqueness(
        routeTree.sortedRouteNodes.filter(
          (d) =>
            d.children === undefined &&
            'lazy' !== d._fsRouteType &&
            d.exports?.includes(EXPORT_NAME),
        ),
        generator.config,
      )
    },
    routeModuleAugmentation: ({ routeNode }) => {
      if (routeNode._fsRouteType === 'lazy') {
        return `const createLazyFileRoute: CreateLazyFileRoute<FileRoutesByPath['${routeNode.routePath}']['preLoaderRoute']>`
      } else {
        return `const createFileRoute: CreateFileRoute<'${routeNode.routePath}',
            FileRoutesByPath['${routeNode.routePath}']['parentRoute'],
            FileRoutesByPath['${routeNode.routePath}']['id'],
            FileRoutesByPath['${routeNode.routePath}']['path'],
            FileRoutesByPath['${routeNode.routePath}']['fullPath']
          >
        `
      }
    },
    createRootRouteCode: () => `createRootRoute()`,
    createVirtualRouteCode: ({ node }) =>
      `createFileRoute('${node.routePath}')()`,
    config: ({ sortedRouteNodes }) => {
      const hasMatchingRouteFiles = sortedRouteNodes.length > 0
      return {
        virtualRootRoute: hasMatchingRouteFiles,
      }
    },
  }
}
