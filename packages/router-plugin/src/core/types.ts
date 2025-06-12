export interface RouteInfo {
  filePath: string
  routePath: string
  isVirtual: boolean
  sourceDir: string
}

export interface RouteNodes {
  routes: Record<string, RouteInfo>
}
