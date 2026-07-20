import type {
  Generator,
  HandleNodeAccumulator,
  RouteNode,
} from '@tanstack/router-generator'

type ServerRouteNode = Pick<RouteNode, 'routePath'> & {
  serverSsr?: true | false | 'data-only'
}

export function pruneServerRoutePieces({
  rootRouteNode,
  acc,
}: {
  rootRouteNode: ServerRouteNode
  acc: HandleNodeAccumulator
}): HandleNodeAccumulator {
  const routePiecesByPath = { ...acc.routePiecesByPath }

  function pruneRoutePieces(node: ServerRouteNode) {
    if (!node.routePath) {
      return
    }

    const pieces = routePiecesByPath[node.routePath]
    if (!pieces) {
      return
    }

    if (node.serverSsr === false) {
      const serverPieces = { ...pieces }
      delete serverPieces.component
      delete serverPieces.loader
      delete serverPieces.lazy
      routePiecesByPath[node.routePath] = serverPieces
    } else if (node.serverSsr === 'data-only') {
      const serverPieces = { ...pieces }
      delete serverPieces.component
      routePiecesByPath[node.routePath] = serverPieces
    }
  }

  pruneRoutePieces(rootRouteNode)
  acc.routeNodes.forEach(pruneRoutePieces)

  return { ...acc, routePiecesByPath }
}

export async function buildServerRouteTree(generator: Generator) {
  const crawlingResult = await generator.getCrawlingResult()
  if (!crawlingResult) {
    throw new Error('Crawling result not available')
  }

  const buildResult = generator.buildRouteTree({
    ...crawlingResult,
    acc: pruneServerRoutePieces(crawlingResult),
    config: {
      disableTypes: true,
      enableRouteTreeFormatting: false,
    },
  })
  return { code: buildResult.routeTreeContent, map: null }
}
