import path from 'node:path'
import {
  cleanPath,
  rootRouteId,
  trimPathLeft,
  trimPathRight,
} from '@tanstack/router-core'
import { rootPathId } from '../filesystem/physical/rootPathId'
import {
  RoutePrefixMap,
  countRoutePathSegments,
  countSlashSeparatedParts,
  createTokenRegex,
  determineNodePath,
  hasParentRoute,
  isSegmentPathless,
  multiSortBy,
  removeGroups,
  removeLastSegmentFromPath,
  removeLayoutSegmentsAndUnderscoresWithEscape,
  removeTrailingSlash,
  sortRouteNodes,
} from '../utils'
import type { Config } from '../config'
import type { ScanResult } from '../filesystem/scan'
import type {
  FsRouteType,
  ModelRoute,
  RouteNode,
  RoutePathSegmentMetadata,
  RoutePieceName,
  RouteProps,
  TreeModel,
} from '../types'

const pieceTypes: ReadonlyArray<FsRouteType> = [
  'lazy',
  'loader',
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
]

const componentPieceRegex =
  /[./](component|errorComponent|notFoundComponent|pendingComponent|loader|lazy)[.]/
const routeGroupPatternRegex = /\(.+\)/

export interface TreeModelInput {
  scan: ScanResult
  config: Pick<Config, 'indexToken' | 'routeToken'>
  /** Whether a route file joins the tree (its analysis found a route). */
  isIncluded: (node: RouteNode) => boolean
  /** The recorded option keys of a route file. */
  propsOf: (node: RouteNode) => RouteProps | undefined
}

type RoutePieces = Partial<Record<RoutePieceName, RouteNode>>

interface Accumulator {
  routeTree: Array<RouteNode>
  routeNodes: Array<RouteNode>
  routePiecesByPath: Record<string, RoutePieces>
  routeNodesByPath: Map<string, RouteNode>
}

function getRoutePathSegmentMetadataForPath(
  node: RouteNode,
  routePath: string,
  parentRoutePath?: string,
): Array<RoutePathSegmentMetadata | undefined> | undefined {
  if (!node._routePathSegmentMetadata) return undefined

  const segments = routePath.split('/')
  const result = new Array<RoutePathSegmentMetadata | undefined>(
    segments.length,
  )
  const parentSegmentCount = countRoutePathSegments(parentRoutePath)
  let hasMetadata = false
  let segmentCount = 0

  for (let i = 0; i < segments.length; i++) {
    if (!segments[i]) continue
    const sourceIndex = parentSegmentCount + segmentCount + 1
    result[i] = node._routePathSegmentMetadata[sourceIndex]
    hasMetadata ||= !!result[i]
    segmentCount++
  }

  return hasMetadata ? result : undefined
}

/**
 * The kind of the route the tree creates for a path that has only a lazy
 * file or pieces: a pathless layout when its own last segment is one, as
 * the route file at that path would be (SPEC J1.8), otherwise a plain route.
 */
function anchorKind(node: RouteNode): FsRouteType {
  const segments = (node.routePath ?? '').split('/')
  const originalSegments = (node.originalRoutePath ?? '').split('/')
  const index = segments.length - 1
  const last = segments[index] ?? ''
  if (last === rootPathId) {
    return 'static'
  }
  const metadata = node._routePathSegmentMetadata?.[index]
  return !metadata?.literalLeadingUnderscore &&
    isSegmentPathless(last, originalSegments[index] ?? '')
    ? 'pathless_layout'
    : 'static'
}

function handleNode(
  node: RouteNode,
  acc: Accumulator,
  prefixMap: RoutePrefixMap,
) {
  let parentRoute = hasParentRoute(prefixMap, node, node.routePath)

  // Check routeNodesByPath for a closer parent that may not be in prefixMap
  // (the prefixMap excludes lazy routes, while the routes the tree creates
  // for lazy-only files are in routeNodesByPath). Walk up the path segments
  // to the closest registered route.
  if (node.routePath) {
    let searchPath = node.routePath
    while (searchPath.length > 0) {
      const lastSlash = searchPath.lastIndexOf('/')
      if (lastSlash <= 0) break

      searchPath = searchPath.substring(0, lastSlash)
      const candidate = acc.routeNodesByPath.get(searchPath)
      if (candidate && candidate.routePath !== node.routePath) {
        if (candidate !== parentRoute) {
          if (
            !parentRoute ||
            (candidate.routePath?.length ?? 0) >
              (parentRoute.routePath?.length ?? 0)
          ) {
            parentRoute = candidate
          }
        }
        break
      }
    }
  }

  // Virtual routes may have an explicit parent from virtual config.
  // If we can find that exact parent, use it to prevent auto-nesting siblings
  // based on path prefix matching (#5822, #5431).
  if (node._virtualParentRoutePath !== undefined) {
    const explicitParent = acc.routeNodesByPath.get(
      node._virtualParentRoutePath,
    )
    if (explicitParent) {
      parentRoute = explicitParent
    } else if (node._virtualParentRoutePath === `/${rootPathId}`) {
      parentRoute = null
    }
    // Otherwise the explicit parent was a virtual file-less route that got
    // filtered out. Fall back to the path-based parentRoute already computed.
  }

  if (parentRoute) node.parent = parentRoute

  node.path = determineNodePath(node)

  const trimmedPath = trimPathLeft(node.path ?? '')
  const originalPath =
    node.originalRoutePath && node.parent?.originalRoutePath
      ? node.originalRoutePath.replace(node.parent.originalRoutePath, '') || '/'
      : node.originalRoutePath
  const routePathSegmentMetadata = getRoutePathSegmentMetadataForPath(
    node,
    node.path ?? '/',
    node.parent?.routePath,
  )
  const trimmedOriginalPath = trimPathLeft(originalPath ?? '')

  const split = trimmedPath.split('/')
  const pathSplit = (node.path ?? '').split('/')
  const originalSplit = trimmedOriginalPath.split('/')
  const lastRouteSegment = split[split.length - 1] ?? trimmedPath
  const lastOriginalSegment =
    originalSplit[originalSplit.length - 1] ?? trimmedOriginalPath
  const lastRouteSegmentMetadata =
    routePathSegmentMetadata?.[pathSplit.length - 1]

  // A segment is non-path if it starts with underscore AND the underscore is not escaped
  node.isNonPath =
    (!lastRouteSegmentMetadata?.literalLeadingUnderscore &&
      isSegmentPathless(lastRouteSegment, lastOriginalSegment)) ||
    split.every((part) => routeGroupPatternRegex.test(part))

  // Use a single pass so layout removal does not desync escaped underscore checks.
  node.cleanedPath = removeGroups(
    removeLayoutSegmentsAndUnderscoresWithEscape(
      node.path,
      originalPath,
      routePathSegmentMetadata,
    ),
  )

  if (
    node._fsRouteType === 'layout' ||
    node._fsRouteType === 'pathless_layout'
  ) {
    node.cleanedPath = removeTrailingSlash(node.cleanedPath)
  }

  if (!node.isVirtual && pieceTypes.includes(node._fsRouteType)) {
    const pieces = (acc.routePiecesByPath[node.routePath!] ??= {})
    pieces[node._fsRouteType as RoutePieceName] = node

    const anchorRoute = acc.routeNodesByPath.get(node.routePath!)

    // A path with only a lazy file or pieces gets a route of its own (the
    // root route's pieces belong to the root route).
    if (!anchorRoute && node.routePath !== `/${rootPathId}`) {
      handleNode(
        {
          ...node,
          isVirtual: true,
          _fsRouteType: anchorKind(node),
        },
        acc,
        prefixMap,
      )
    }
    return
  }

  const isPathlessLayoutWithPath =
    node._fsRouteType === 'pathless_layout' &&
    node.cleanedPath &&
    node.cleanedPath.length > 0

  // A pathless layout with a path nests under its nearest ancestor route
  // (a route the tree creates for a lazy-only file included, SPEC J1.14).
  if (!node.isVirtual && isPathlessLayoutWithPath) {
    const immediateParentPath = removeLastSegmentFromPath(node.routePath) || '/'
    const immediateParentOriginalPath =
      removeLastSegmentFromPath(node.originalRoutePath) || '/'
    let searchPath = immediateParentPath

    while (searchPath) {
      const candidate = acc.routeNodesByPath.get(searchPath)
      if (candidate && candidate.path !== '/') {
        node.parent = candidate
        node.path =
          node.routePath?.replace(candidate.routePath ?? '', '') || '/'
        const pathRelativeToParent =
          immediateParentPath.replace(candidate.routePath ?? '', '') || '/'
        const originalPathRelativeToParent =
          immediateParentOriginalPath.replace(
            candidate.originalRoutePath ?? '',
            '',
          ) || '/'
        const routePathSegmentMetadataRelativeToParent =
          getRoutePathSegmentMetadataForPath(
            node,
            pathRelativeToParent,
            candidate.routePath,
          )
        node.cleanedPath = removeGroups(
          removeLayoutSegmentsAndUnderscoresWithEscape(
            pathRelativeToParent,
            originalPathRelativeToParent,
            routePathSegmentMetadataRelativeToParent,
          ),
        )
        break
      }
      if (searchPath === '/') break
      searchPath = removeLastSegmentFromPath(searchPath) || '/'
    }
  }

  if (node.parent) {
    node.parent.children = node.parent.children ?? []
    node.parent.children.push(node)
  } else {
    acc.routeTree.push(node)
  }

  acc.routeNodes.push(node)
  if (node.routePath) {
    // Registered by path so child routes can find parents (the routes
    // created for lazy-only files included; a route file at the same path
    // processed later replaces them).
    acc.routeNodesByPath.set(node.routePath, node)
  }
}

/** The path a route types: its cleaned path without a trailing slash, except `/`. */
function typePathOf(node: RouteNode): string {
  if (node.cleanedPath === '/') {
    return node.cleanedPath
  }
  return node.cleanedPath?.replace(/\/$/, '') ?? ''
}

/** Identifiers the printed tree declares besides the routes' own. */
const reservedNames = new Set([
  'rootRouteImport',
  'rootRouteChildren',
  'routeTree',
  'createFileRoute',
  'lazyRouteComponent',
  'lazyFn',
])

/** The identifiers a route's variable name gives in the printed tree. */
function namesOf(base: string) {
  return [
    `${base}RouteImport`,
    `${base}Route`,
    `${base}RouteWithChildren`,
    `${base}RouteChildren`,
  ]
}

/**
 * Unique variable names, assigned in the routes' order: a name another
 * route already took (`about-us` and `aboutUs`, `users/$id` and
 * `users/id`) gets a numeric suffix.
 */
function uniqueVariableNames(nodes: ReadonlyArray<RouteNode>) {
  const taken = new Set(reservedNames)
  const names = new Map<RouteNode, string>()
  for (const node of nodes) {
    let base = node.variableName
    for (let n = 2; namesOf(base).some((name) => taken.has(name)); n++) {
      base = `${node.variableName}${n}`
    }
    namesOf(base).forEach((name) => taken.add(name))
    names.set(node, base)
  }
  return names
}

/**
 * The tree model: which routes the tree has, their parents, ids, paths and
 * pieces. A pure function of the scan and the per-file facts: every call
 * builds new nodes (no route node outlives a generation).
 */
export function buildTreeModel(input: TreeModelInput): TreeModel {
  const { scan, config } = input
  const indexTokenFilenameRegex = createTokenRegex(config.indexToken, {
    type: 'filename',
  })
  const routeTokenFilenameRegex = createTokenRegex(config.routeToken, {
    type: 'filename',
  })
  const indexTokenSegmentRegex = createTokenRegex(config.indexToken, {
    type: 'segment',
  })

  const preRouteNodes = multiSortBy(scan.routeNodes, [
    (d) => (d.routePath === '/' ? -1 : 1),
    (d) =>
      d.routePath === undefined
        ? undefined
        : countSlashSeparatedParts(d.routePath),
    (d) => (d.filePath.match(indexTokenFilenameRegex) ? 1 : -1),
    (d) => (d.filePath.match(componentPieceRegex) ? 1 : -1),
    (d) => (d.filePath.match(routeTokenFilenameRegex) ? -1 : 1),
    (d) => (d.routePath?.endsWith('/') ? -1 : 1),
    (d) => d.routePath,
  ]).filter((d) => {
    // Exclude the root route itself, but keep its pieces
    if (d.routePath === `/${rootPathId}`) {
      return pieceTypes.includes(d._fsRouteType)
    }
    return true
  })

  // Fresh nodes: only route files whose analysis found a route (file-less
  // virtual routes are not routes of the tree).
  const source = new Map<RouteNode, RouteNode>()
  const routeFileNodes: Array<RouteNode> = []
  for (const node of preRouteNodes) {
    if (
      node.isVirtualParentRoute ||
      node.isVirtual ||
      !input.isIncluded(node)
    ) {
      continue
    }
    const copy: RouteNode = { ...node, children: undefined, parent: undefined }
    source.set(copy, node)
    routeFileNodes.push(copy)
  }

  const acc: Accumulator = {
    routeTree: [],
    routeNodes: [],
    routePiecesByPath: {},
    routeNodesByPath: new Map(),
  }
  const prefixMap = new RoutePrefixMap(routeFileNodes)
  for (const node of routeFileNodes) {
    handleNode(node, acc, prefixMap)
  }

  const sorted = sortRouteNodes(acc.routeNodes, indexTokenSegmentRegex)
  const variableNames = uniqueVariableNames(sorted)

  const piecesOf = (routePath: string | undefined) => {
    const pieces: Partial<Record<RoutePieceName, string>> = {}
    const found = routePath ? acc.routePiecesByPath[routePath] : undefined
    if (found) {
      for (const [name, piece] of Object.entries(found)) {
        pieces[name as RoutePieceName] = piece.fullPath
      }
    }
    return pieces
  }

  const propsOf = (node: RouteNode) => {
    const scanned = source.get(node)
    return scanned ? input.propsOf(scanned) : undefined
  }

  // The router's own formulas (router-core `Route.init`), from the options
  // the tree passes: the types describe the runtime tree (SPEC J1.13).
  const models = new Map<RouteNode, ModelRoute>()
  const toModel = (node: RouteNode): ModelRoute => {
    const existing = models.get(node)
    if (existing) {
      return existing
    }
    const parent = node.parent ? toModel(node.parent) : undefined
    const parentId = parent?.id ?? rootRouteId
    const parentFullPath = parent?.fullPath ?? '/'
    const relativeId = node.path ?? '/'
    const pathOption =
      !node.isNonPath ||
      (node._fsRouteType === 'pathless_layout' && node.cleanedPath)
        ? (node.cleanedPath ?? '')
        : undefined
    let runtimePath = pathOption
    if (runtimePath && runtimePath !== '/') {
      runtimePath = trimPathLeft(runtimePath)
    }
    const id = cleanPath(
      (parentId === rootRouteId ? '' : parentId) + '/' + relativeId,
    )
    const fullPath =
      runtimePath === undefined
        ? parentFullPath
        : cleanPath(parentFullPath + '/' + runtimePath)
    const model: ModelRoute = {
      routePath: node.routePath ?? '',
      id,
      fullPath,
      to: trimPathRight(fullPath),
      relativeId,
      pathOption,
      typePath: typePathOf(node),
      variableName: variableNames.get(node) ?? node.variableName,
      kind: node._fsRouteType,
      isNonPath: !!node.isNonPath,
      isAnchor: !!node.isVirtual,
      file: node.isVirtual ? undefined : node.fullPath,
      filePath: node.filePath,
      parent,
      children: [],
      pieces: piecesOf(node.routePath),
      props: node.isVirtual ? undefined : propsOf(node),
    }
    models.set(node, model)
    return model
  }

  const routes = sorted.map(toModel)
  for (const node of sorted) {
    const model = models.get(node)!
    ;(model.children as Array<ModelRoute>).push(
      ...(node.children ?? []).map((child) => models.get(child)!),
    )
  }
  for (const route of routes) {
    const children = route.children as Array<ModelRoute>
    children.splice(0, children.length, ...ownersLast(children))
  }

  const rootNode = scan.rootRouteNode
  return {
    root: {
      file: rootNode.fullPath,
      filePath: rootNode.filePath,
      routePath: rootNode.routePath ?? `/${rootPathId}`,
      pieces: piecesOf(`/${rootPathId}`),
      props: input.propsOf(rootNode),
    },
    routes,
    children: ownersLast(acc.routeTree.map((node) => models.get(node)!)),
    attachOrder: acc.routeNodes.map((node) => models.get(node)!),
  }
}

/**
 * Siblings with routes that own no URL first: a pathless layout without
 * children yet matches its parent's path, like an index route there, and of
 * two such leaves the router matches the one declared last (SPEC J1.15:
 * the index route is the page).
 */
function ownersLast(routes: Array<ModelRoute>) {
  const ownsNoUrl = (route: ModelRoute) =>
    route.isNonPath && route.children.length === 0
  return [
    ...routes.filter(ownsNoUrl),
    ...routes.filter((route) => !ownsNoUrl(route)),
  ]
}

/**
 * Checks that no two routes of the tree have the same URL (SPEC J1.7):
 * routes with child routes, lazy files and routes without a path segment
 * of their own (pathless layouts, groups: they own no URL, J1.15) aside.
 * The error names the files.
 */
export function checkRouteFullPathUniqueness(model: TreeModel) {
  checkRouteIdUniqueness(model)

  const routes = model.routes.filter(
    (route) =>
      route.children.length === 0 && route.kind !== 'lazy' && !route.isNonPath,
  )
  const fileOf = (route: ModelRoute) =>
    path.normalize(
      route.file ?? Object.values(route.pieces)[0] ?? route.routePath,
    )

  const emptyPathRoutes = routes.filter((route) => route.routePath === '')
  if (emptyPathRoutes.length) {
    throw new Error(
      `Invalid route path "" was found. Root routes must be defined via __root.tsx (createRootRoute), not createFileRoute('') or a route file that resolves to an empty path.
Conflicting files: \n ${emptyPathRoutes.map(fileOf).join('\n ')}\n`,
    )
  }

  const byFullPath = new Map<string, Array<ModelRoute>>()
  for (const route of routes) {
    const list = byFullPath.get(route.fullPath) ?? []
    list.push(route)
    byFullPath.set(route.fullPath, list)
  }
  const conflicting = [...byFullPath.values()]
    .filter((list) => list.length > 1)
    .flat()
  if (conflicting.length) {
    throw new Error(
      `Conflicting configuration paths were found for the following route${conflicting.length > 1 ? 's' : ''}: ${conflicting
        .map((route) => `"${route.fullPath}"`)
        .join(', ')}.
Please ensure each Route has a unique full path.
Conflicting files: \n ${conflicting.map(fileOf).join('\n ')}\n`,
    )
  }
}

/**
 * Two routes with one id (`posts.tsx` and `posts/route.tsx` once a child
 * route nests under one of them) are an error naming their files: the
 * router would reject the tree at startup without naming any (SPEC J1.7).
 */
function checkRouteIdUniqueness(model: TreeModel) {
  const byId = new Map<string, Array<ModelRoute>>()
  for (const route of model.routes) {
    const list = byId.get(route.id) ?? []
    list.push(route)
    byId.set(route.id, list)
  }
  const duplicates = [...byId].filter(([, list]) => list.length > 1)
  if (duplicates.length) {
    throw new Error(
      `Several route files were found for the route${duplicates.length > 1 ? 's' : ''} ${duplicates
        .map(([id]) => `"${id}"`)
        .join(', ')}. Please keep one route file per route.
Conflicting files: \n ${duplicates
        .flatMap(([, list]) =>
          list.map((route) => path.normalize(route.file ?? route.routePath)),
        )
        .join('\n ')}\n`,
    )
  }
}
