export type RouteNode = {
  filePath: string
  fullPath: string
  variableName: string
  _fsRouteType: FsRouteType
  routePath?: string
  cleanedPath?: string
  path?: string
  isNonPath?: boolean
  isVirtualParentRequired?: boolean
  isVirtualParentRoute?: boolean
  isVirtual?: boolean
  children?: Array<RouteNode>
  parent?: RouteNode
  exports?: Array<string>
}

export interface GetRouteNodesResult {
  rootRouteNode?: RouteNode
  routeNodes: Array<RouteNode>
  physicalDirectories: Array<string>
}

export type FsRouteType =
  | '__root'
  | 'static'
  | 'layout'
  | 'pathless_layout'
  | 'lazy'
  | 'loader' // @deprecated
  | 'component' // @deprecated
  | 'pendingComponent' // @deprecated
  | 'errorComponent' // @deprecated

export type RouteSubNode = {
  component?: RouteNode
  errorComponent?: RouteNode
  pendingComponent?: RouteNode
  loader?: RouteNode
  lazy?: RouteNode
}

export type ImportSpecifier = {
  imported: string
  local?: string
}
export type ImportDeclaration = {
  source: string
  specifiers: Array<ImportSpecifier>
  importKind?: 'type' | 'value'
}

export type HandleNodeAccumulator = {
  routeTree: Array<RouteNode>
  routePiecesByPath: Record<string, RouteSubNode>
  routeNodes: Array<RouteNode>
}

export type GetRoutesByFileMapResultValue = { routePath: string }
export type GetRoutesByFileMapResult = Map<
  string,
  GetRoutesByFileMapResultValue
>
