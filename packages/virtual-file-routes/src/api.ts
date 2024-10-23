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

export function route(path: string, children: Array<VirtualRouteNode>): Route
export function route(path: string, file: string): Route
export function route(
  path: string,
  file: string,
  children: Array<VirtualRouteNode>,
): Route
export function route(
  path: string,
  fileOrChildren: string | Array<VirtualRouteNode>,
  children?: Array<VirtualRouteNode>,
): Route {
  if (typeof fileOrChildren === 'string') {
    return {
      type: 'route',
      file: fileOrChildren,
      path,
      children,
    }
  }
  return {
    type: 'route',
    path,
    children: fileOrChildren,
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
