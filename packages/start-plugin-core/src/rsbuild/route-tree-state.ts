import { Generator } from '@tanstack/router-generator'
import { pruneServerOnlySubtrees } from '../start-router-plugin/pruneServerOnlySubtrees'
import type { Config } from '@tanstack/router-generator'

let generatorInstance: Generator | null = null

export function setGeneratorInstance(generator: Generator) {
  generatorInstance = generator
}

export async function getClientRouteTreeContent(options?: {
  routerConfig?: Config
  root?: string
}) {
  let generator = generatorInstance
  if (!generator) {
    if (!options?.routerConfig || !options.root) {
      throw new Error('Generator instance not initialized for route tree loader')
    }
    generator = new Generator({
      config: options.routerConfig,
      root: options.root,
    })
    await generator.run()
  }
  const crawlingResult = await generator.getCrawlingResult()
  if (!crawlingResult) {
    throw new Error('Crawling result not available')
  }
  const prunedAcc = pruneServerOnlySubtrees(crawlingResult)
  const acc = {
    ...crawlingResult.acc,
    ...prunedAcc,
  }
  const buildResult = generator.buildRouteTree({
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
