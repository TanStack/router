import { pruneServerOnlySubtrees } from '../start-router-plugin/pruneServerOnlySubtrees'
import type { Generator } from '@tanstack/router-generator'

let generatorInstance: Generator | null = null

export function setGeneratorInstance(generator: Generator) {
  generatorInstance = generator
}

export async function getClientRouteTreeContent() {
  if (!generatorInstance) {
    throw new Error('Generator instance not initialized for route tree loader')
  }
  const crawlingResult = await generatorInstance.getCrawlingResult()
  if (!crawlingResult) {
    throw new Error('Crawling result not available')
  }
  const prunedAcc = pruneServerOnlySubtrees(crawlingResult)
  const acc = {
    ...crawlingResult.acc,
    ...prunedAcc,
  }
  const buildResult = generatorInstance.buildRouteTree({
    ...crawlingResult,
    acc,
    config: {
      disableTypes: true,
      enableRouteTreeFormatting: false,
      routeTreeFileHeader: [],
      routeTreeFileFooter: [],
    },
  })
  return buildResult.routeTreeContent
}
