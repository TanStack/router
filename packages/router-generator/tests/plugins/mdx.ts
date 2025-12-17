import path from 'node:path'
import { removeExt, replaceBackslash } from '../../src/utils'
import type { GeneratorPlugin } from '../../src/plugin/types'
import type { ImportDeclaration } from '../../src/types'

export function mdxRouteGen(): GeneratorPlugin {
  return {
    name: 'mdx',

    isBuiltInFile({ fileName }) {
      return fileName.endsWith('.mdx')
    },

    transformNodes({ config, routeNodes }) {
      return routeNodes.map((node) => {
        const isMdx = node.filePath.endsWith('.mdx')

        if (isMdx) {
          const base = removeExt(node.filePath)
          const hasTsxSibling = routeNodes.some(
            (n) =>
              n !== node &&
              !n.filePath.endsWith('.mdx') &&
              removeExt(n.filePath) === base,
          )

          // If MDX has a TSX sibling - skip it (TSX is the route)
          if (hasTsxSibling) {
            return {
              ...node,
              isVirtual: true,
              skipTransform: true,
            }
          }

          return {
            ...node,
            componentImport: { exportName: 'default', keepExtension: true },
            extension: `.update({ component: ${node.variableName}RouteComponent })`,
            skipTransform: true,
          }
        }

        // If not an MDX file - check if it has an MDX sibling
        const base = removeExt(node.filePath)
        const mdxSibling = routeNodes.find(
          (n) =>
            n !== node &&
            n.filePath.endsWith('.mdx') &&
            removeExt(n.filePath) === base,
        )

        // TSX has an MDX sibling - set template for scaffolding
        if (mdxSibling) {
          return {
            ...node,
            template: {
              template: () =>
                [
                  '%%tsrImports%%',
                  '\n\n',
                  '%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n',
                ].join(''),
              imports: {
                tsrImports: () =>
                  `import RouteComponent from \'./${mdxSibling.filePath}\';`,
                tsrExportStart: (routePath) =>
                  config.verboseFileRoutes === false
                    ? 'export const Route = createFileRoute('
                    : `export const Route = createFileRoute('${routePath}')(`,
                tsrExportEnd: () => ');',
              },
            },
          }
        }

        return node
      })
    },

    getAdditionalRouteTreeContent({ routeNodes, config }) {
      const mdxNodes = routeNodes.filter(
        (n) =>
          n.filePath.endsWith('.mdx') &&
          n.extension?.includes('RouteComponent'),
      )
      if (mdxNodes.length === 0) return

      const imports: Array<ImportDeclaration> = []

      for (const node of mdxNodes) {
        const importPath = replaceBackslash(
          path.relative(
            path.dirname(config.generatedRouteTree),
            path.resolve(config.routesDirectory, node.filePath),
          ),
        )
        imports.push({
          source: `./${importPath}`,
          specifiers: [
            {
              imported: 'default',
              local: `${node.variableName}RouteComponent`,
            },
          ],
        })
      }

      return { imports }
    },
  }
}
