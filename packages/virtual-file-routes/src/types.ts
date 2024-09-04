export type IndexRoute = {
  type: 'index'
  file: string
}

export type LayoutRoute = {
  type: 'layout'
  id?: string
  file: string
  children?: Array<VirtualRouteNode>
}

export type Route = {
  type: 'route'
  file: string
  path: string
  children?: Array<VirtualRouteNode>
}
export type VirtualRouteNode = IndexRoute | LayoutRoute | Route

export type VirtualRootRoute = {
  type: 'root'
  file: string
  children?: Array<VirtualRouteNode>
}
