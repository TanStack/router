import type {
  IndexRoute,
  LayoutRoute,
  PhysicalSubtree,
  Route,
  VirtualRootRoute,
  VirtualRouteNode,
} from './types'

export function rootRoute(
  file: string,
  children?: Array<VirtualRouteNode>,
): VirtualRootRoute {
  return {
    type: 'root',
    file,
    children,
  }
}

export function index(file: string): IndexRoute {
  return {
    type: 'index',
    file,
  }
}

export function layout(
  file: string,
  children: Array<VirtualRouteNode>,
): LayoutRoute
export function layout(
  id: string,
  file: string,
  children: Array<VirtualRouteNode>,
): LayoutRoute

export function layout(
  idOrFile: string,
  fileOrChildren: string | Array<VirtualRouteNode>,
  children?: Array<VirtualRouteNode>,
): LayoutRoute {
  if (Array.isArray(fileOrChildren)) {
    return {
      type: 'layout',
      file: idOrFile,
      children: fileOrChildren,
    }
  } else {
    return {
      type: 'layout',
      id: idOrFile,
      file: fileOrChildren,
      children,
    }
  }
}

export function route(
  path: string,
  file: string,
  children?: Array<VirtualRouteNode>,
): Route {
  return {
    type: 'route',
    file,
    path,
    children,
  }
}

export function physical(
  pathPrefix: string,
  directory: string,
): PhysicalSubtree {
  return {
    type: 'physical',
    directory,
    pathPrefix,
  }
}
