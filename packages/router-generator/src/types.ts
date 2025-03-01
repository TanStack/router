export type RouteNode = {
  filePath: string
  fullPath: string
  variableName: string
  routeType: RouteType
  routePath?: string
  cleanedPath?: string
  path?: string
  isNonPath?: boolean
  isVirtualParentRequired?: boolean
  isVirtualParentRoute?: boolean
  isVirtual?: boolean
  children?: Array<RouteNode>
  parent?: RouteNode
}

export interface GetRouteNodesResult {
  rootRouteNode?: RouteNode
  routeNodes: Array<RouteNode>
}

export type RouteType =
  | '__root'
  | 'static'
  | 'layout'
  | 'pathless-layout'
  | 'lazy'
  | 'api'
  | 'loader' // @deprecated
  | 'component' // @deprecated
  | 'pendingComponent' // @deprecated
  | 'errorComponent' // @deprecated
