import * as t from '@babel/types'
import type {
  DeleteNodeCallback,
  DeletableNodes,
} from '@tanstack/router-plugin'

const CLIENT_ONLY_ROUTE_OPTION_NODES = [
  'context.revalidate',
  'context.hydrate',
  'beforeLoad.hydrate',
  'loader.hydrate',
]

const SERVER_ONLY_ROUTE_OPTION_NODES = ['ssr', 'server', 'headers']

const DEHYDRATE_ROUTE_OPTION_NODES = new Set([
  'context.dehydrate',
  'beforeLoad.dehydrate',
  'loader.dehydrate',
])

const replaceCustomDehydrateWithClientMarker: DeleteNodeCallback = ({
  dotPath,
  prop,
  key,
}) => {
  if (!DEHYDRATE_ROUTE_OPTION_NODES.has(dotPath)) {
    return
  }

  if (t.isObjectProperty(prop) && t.isBooleanLiteral(prop.value)) {
    return
  }

  return {
    action: 'replace',
    node: t.objectProperty(t.identifier(key), t.booleanLiteral(true)),
  }
}

export function getRouteOptionDeleteNodesForClient(
  userDeleteNodes: Array<DeletableNodes> | undefined,
): Array<DeletableNodes> {
  return [
    ...new Set([
      ...(userDeleteNodes ?? []),
      ...SERVER_ONLY_ROUTE_OPTION_NODES,
      replaceCustomDehydrateWithClientMarker,
    ]),
  ]
}

export function getRouteOptionDeleteNodesForServer(
  userDeleteNodes: Array<DeletableNodes> | undefined,
): Array<DeletableNodes> {
  return [
    ...new Set([...(userDeleteNodes ?? []), ...CLIENT_ONLY_ROUTE_OPTION_NODES]),
  ]
}
