export type RouteNode = {
  filePath: string
  fullPath: string
  variableName: string
  routePath?: string
  cleanedPath?: string
  path?: string
  isNonPath?: boolean
  isLayout?: boolean
  isVirtualParentRequired?: boolean
  isVirtualParentRoute?: boolean
  isRoute?: boolean
  isAPIRoute?: boolean
  isLoader?: boolean
  isComponent?: boolean
  isErrorComponent?: boolean
  isPendingComponent?: boolean
  isVirtual?: boolean
  isLazy?: boolean
  isRoot?: boolean
  children?: Array<RouteNode>
  parent?: RouteNode
}

export interface GetRouteNodesResult {
  rootRouteNode?: RouteNode
  routeNodes: Array<RouteNode>
}
