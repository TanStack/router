export type RouteNode = {
  filePath: string
  fullPath: string
  variableName: string
  routePath?: string
  cleanedPath?: string
  path?: string
  isNonPath?: boolean
  isVirtualParentRequired?: boolean
  isVirtualParentRoute?: boolean
  isComponent?: boolean
  isErrorComponent?: boolean
  isPendingComponent?: boolean
  isVirtual?: boolean
  children?: Array<RouteNode>
  parent?: RouteNode
  routeType: RouteType
}

export interface GetRouteNodesResult {
  rootRouteNode?: RouteNode
  routeNodes: Array<RouteNode>
}

export type RouteType =
  | '__root'
  | 'static'
  | 'layout'
  | 'pathless'
  | 'lazy'
  | 'api'
  | 'loader' // @deprecated
  | 'component' // @deprecated
  | 'pendingComponent' // @deprecated
  | 'errorComponent' // @deprecated
