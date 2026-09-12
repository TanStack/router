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
      routePiecesByPath[node.routePath] = serverPieces
    } else if (node.serverSsr === 'data-only') {
      const serverPieces = { ...pieces }
      delete serverPieces.component
      routePiecesByPath[node.routePath] = serverPieces
    }
  }

  // The root is rendered for SPA shells regardless of its configured SSR mode.
  acc.routeNodes.forEach((node) => {
    if (node.routePath !== rootRouteNode.routePath) {
      pruneRoutePieces(node)
    }
  })

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
  // Virtual routes have no source module for the pruning compiler to transform.
  // Preserve the same hydration signal for their removed loader pieces.
  const pendingVirtualRoutes = crawlingResult.acc.routeNodes
    .filter(
      (node: RouteNode & ServerRouteNode) =>
        node.isVirtual && node.serverSsr === false,
    )
    .map((node) => `${node.variableName}Route.update({ beforeLoad: () => {} })`)
  return {
    code: [buildResult.routeTreeContent, ...pendingVirtualRoutes].join('\n'),
    map: null,
  }
}
