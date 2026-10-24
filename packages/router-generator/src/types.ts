export type RoutePathSegmentMetadata = {
  literalLeadingUnderscore?: boolean
  literalTrailingUnderscore?: boolean
}

/**
 * A route file (or a file-less virtual route) as the scan of the routes
 * directory and the virtual route config finds it. The scanners create new
 * nodes on every scan; the tree model works on its own copies.
 */
export type RouteNode = {
  filePath: string
  fullPath: string
  variableName: string
  _fsRouteType: FsRouteType
  routePath?: string
  originalRoutePath?: string
  cleanedPath?: string
  path?: string
  isNonPath?: boolean
  isVirtualParentRoute?: boolean
  isVirtual?: boolean
  children?: Array<RouteNode>
  parent?: RouteNode
  /**
   * For virtual routes: the routePath of the explicit parent from virtual config.
   * Used to prevent auto-nesting siblings based on path prefix matching (#5822, #5431).
   * Falls back to path-based inference if the explicit parent is not found
   * (e.g., when the parent is a virtual file-less route that gets filtered out).
   */
  _virtualParentRoutePath?: string
  /** Internal routePath segment metadata for escaped or explicit literal syntax. */
  _routePathSegmentMetadata?: Array<RoutePathSegmentMetadata | undefined>
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
  | 'notFoundComponent' // @deprecated

export type RoutePieceName =
  | 'component'
  | 'errorComponent'
  | 'notFoundComponent'
  | 'pendingComponent'
  | 'loader'
  | 'lazy'

/**
 * The option keys of a route file's `createFileRoute(...)({...})` call
 * (SPEC J1.9). `unknown` is set whenever a key may have been missed (a
 * spread, a computed key that is not a string, options that are not an
 * object literal, a route not created by the router's constructor):
 * consumers must then assume any option may be present.
 */
export interface RouteProps {
  readonly known: ReadonlySet<string>
  readonly unknown: boolean
}

/** A route of the tree model (`TreeModel`), rebuilt on every generation. */
export interface ModelRoute {
  /** The route's file route id: the `createFileRoute('…')` argument and the `FileRoutesByPath` key. */
  readonly routePath: string
  /** The `id` the router gives the route. */
  readonly id: string
  /** The `fullPath` the router gives the route. */
  readonly fullPath: string
  /** The `to` the router gives the route. */
  readonly to: string
  /** The `id` option the tree passes (relative to the parent). */
  readonly relativeId: string
  /** The `path` option the tree passes; undefined for a pathless route. */
  readonly pathOption: string | undefined
  /** The path the route types (`FileRoutesByPath` `path`). */
  readonly typePath: string
  readonly variableName: string
  readonly kind: FsRouteType
  /** Whether the route adds no path segment (pathless layouts, groups). */
  readonly isNonPath: boolean
  /** A route the tree creates without a route file (lazy-only or piece-only routes). */
  readonly isAnchor: boolean
  /** The route file (absolute path); undefined for an anchor. */
  readonly file: string | undefined
  /** The route file relative to the routes directory, as scanned. */
  readonly filePath: string
  readonly parent: ModelRoute | undefined
  readonly children: ReadonlyArray<ModelRoute>
  /** Lazily loaded files of the route, by option (absolute paths). */
  readonly pieces: Readonly<Partial<Record<RoutePieceName, string>>>
  readonly props: RouteProps | undefined
}

/**
 * The route tree, as a pure function of the scan and the facts of each route
 * file. The runtime tree and its types are both printed from it.
 */
export interface TreeModel {
  readonly root: {
    readonly file: string
    readonly filePath: string
    readonly routePath: string
    readonly pieces: Readonly<Partial<Record<RoutePieceName, string>>>
    readonly props: RouteProps | undefined
  }
  /** Every route but the root, in a deterministic order (parents before children within a depth). */
  readonly routes: ReadonlyArray<ModelRoute>
  /** The root route's children. */
  readonly children: ReadonlyArray<ModelRoute>
  /**
   * The routes in the order they were attached to the tree: which route a
   * full path or `to` shared by several routes stands for in the types is
   * decided in this order.
   */
  readonly attachOrder: ReadonlyArray<ModelRoute>
}

export type GetRoutesByFileMapResultValue = { routeId: string }
export type GetRoutesByFileMapResult = Map<
  string,
  GetRoutesByFileMapResultValue
>
