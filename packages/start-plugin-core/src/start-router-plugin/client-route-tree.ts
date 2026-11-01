import { pruneServerOnlySubtrees } from '@tanstack/router-generator'
import { normalize } from 'pathe'
import { SERVER_PROP } from './constants'
import type {
  Generator,
  GeneratorPlugin,
  RouteNode,
} from '@tanstack/router-generator'

function isServerOnlyNode(node: RouteNode | undefined) {
  return (
    node?.createFileRouteProps?.has(SERVER_PROP) === true &&
    node.createFileRouteProps.size === 1
  )
}

/** Shared client-tree generation and provider views for both bundlers. */
export function createClientRouteTree(invalidate: () => void = () => {}) {
  let generator: Generator | undefined
  let moduleTrees = new Map<string, string>()

  const generatorPlugin: GeneratorPlugin = {
    name: 'start-client-tree-plugin',
    init({ generator: instance }) {
      generator = instance
    },
    afterTransform({ node, prevNode }) {
      if (isServerOnlyNode(node) !== isServerOnlyNode(prevNode)) {
        invalidate()
      }
    },
    onRouteTreeChanged() {
      moduleTrees = new Map(
        generator!
          .getRouteModuleClientTrees()
          .map(({ filePath, clientFilePath }) => [
            normalize(filePath),
            clientFilePath,
          ]),
      )
      invalidate()
    },
  }

  return {
    generatorPlugin,
    getModuleClientTree(id: string) {
      // The suffix belongs to the bundler's module identity. Only the physical
      // filename participates in matching the provider's generated tree.
      const suffixAt = id.search(/[?#]/)
      const filePath = suffixAt === -1 ? id : id.slice(0, suffixAt)
      const clientFilePath = moduleTrees.get(normalize(filePath))
      return clientFilePath === undefined
        ? undefined
        : `${clientFilePath}${suffixAt === -1 ? '' : id.slice(suffixAt)}`
    },
    async build() {
      if (!generator) {
        throw new Error('Generator instance not initialized')
      }
      const crawlingResult = await generator.getCrawlingResult()
      if (!crawlingResult) {
        throw new Error('Crawling result not available')
      }
      const result = generator.buildRouteTree({
        ...crawlingResult,
        acc: {
          ...crawlingResult.acc,
          ...pruneServerOnlySubtrees(crawlingResult),
        },
        config: {
          disableTypes: true,
          enableRouteTreeFormatting: false,
          routeTreeFileHeader: [],
          routeTreeFileFooter: [],
        },
      })
      return {
        code: result.routeTreeContent,
        dependencies: [
          ...generator.getRoutesByFileMap().keys(),
          ...generator.getRouteModuleWatchFiles(),
        ],
      }
    },
  }
}
