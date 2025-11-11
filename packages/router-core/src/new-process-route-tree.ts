import invariant from 'tiny-invariant'

export const SEGMENT_TYPE_PATHNAME = 0
export const SEGMENT_TYPE_PARAM = 1
export const SEGMENT_TYPE_WILDCARD = 2
export const SEGMENT_TYPE_OPTIONAL_PARAM = 3

export type SegmentKind =
  | typeof SEGMENT_TYPE_PATHNAME
  | typeof SEGMENT_TYPE_PARAM
  | typeof SEGMENT_TYPE_WILDCARD
  | typeof SEGMENT_TYPE_OPTIONAL_PARAM

const PARAM_W_CURLY_BRACES_RE =
  /^([^{]*)\{\$([a-zA-Z_$][a-zA-Z0-9_$]*)\}([^}]*)$/ // prefix{$paramName}suffix
const OPTIONAL_PARAM_W_CURLY_BRACES_RE =
  /^([^{]*)\{-\$([a-zA-Z_$][a-zA-Z0-9_$]*)\}([^}]*)$/ // prefix{-$paramName}suffix
const WILDCARD_W_CURLY_BRACES_RE = /^([^{]*)\{\$\}([^}]*)$/ // prefix{$}suffix

/**
 * Populates the `output` array with the parsed representation of the given `segment` string.
 * - `output[0]` = segment type (0 = pathname, 1 = param, 2 = wildcard, 3 = optional param)
 * - `output[1]` = index of the end of the prefix
 * - `output[2]` = index of the start of the value
 * - `output[3]` = index of the end of the value
 * - `output[4]` = index of the start of the suffix
 * - `output[5]` = index of the end of the segment
 */
export function parseSegment(
  /** The full path string containing the segment. */
  path: string,
  /** The starting index of the segment within the path. */
  start: number,
  /** A Uint16Array (length: 6) to populate with the parsed segment data. */
  output: Uint16Array,
) {
  const next = path.indexOf('/', start)
  const end = next === -1 ? path.length : next
  const part = path.substring(start, end)

  if (!part || !part.includes('$')) {
    // early escape for static pathname
    output[0] = SEGMENT_TYPE_PATHNAME
    output[1] = start
    output[2] = start
    output[3] = end
    output[4] = end
    output[5] = end
    return
  }

  // $ (wildcard)
  if (part === '$') {
    output[0] = SEGMENT_TYPE_WILDCARD
    output[1] = start
    output[2] = start
    output[3] = end
    output[4] = end
    output[5] = end
    return
  }

  // $paramName
  if (part.charCodeAt(0) === 36) {
    output[0] = SEGMENT_TYPE_PARAM
    output[1] = start
    output[2] = start + 1 // skip '$'
    output[3] = start + part.length
    output[4] = end
    output[5] = end
    return
  }

  const wildcardBracesMatch = part.match(WILDCARD_W_CURLY_BRACES_RE)
  if (wildcardBracesMatch) {
    const prefix = wildcardBracesMatch[1]!
    const suffix = wildcardBracesMatch[2]!
    const total = path.length
    output[0] = SEGMENT_TYPE_WILDCARD
    output[1] = start + prefix.length
    output[2] = start + prefix.length
    output[3] = total - suffix.length
    output[4] = total - suffix.length
    output[5] = total
    return
  }

  const optionalParamBracesMatch = part.match(OPTIONAL_PARAM_W_CURLY_BRACES_RE)
  if (optionalParamBracesMatch) {
    const prefix = optionalParamBracesMatch[1]!
    const paramName = optionalParamBracesMatch[2]!
    const suffix = optionalParamBracesMatch[3]!
    output[0] = SEGMENT_TYPE_OPTIONAL_PARAM
    output[1] = start + prefix.length
    output[2] = start + prefix.length + 3 // skip '{-$'
    output[3] = start + prefix.length + 3 + paramName.length
    output[4] = end - suffix.length
    output[5] = end
    return
  }

  const paramBracesMatch = part.match(PARAM_W_CURLY_BRACES_RE)
  if (paramBracesMatch) {
    const prefix = paramBracesMatch[1]!
    const paramName = paramBracesMatch[2]!
    const suffix = paramBracesMatch[3]!
    output[0] = SEGMENT_TYPE_PARAM
    output[1] = start + prefix.length
    output[2] = start + prefix.length + 2 // skip '{$'
    output[3] = start + prefix.length + 2 + paramName.length
    output[4] = end - suffix.length
    output[5] = end
    return
  }

  // fallback to static pathname (should never happen)
  output[0] = SEGMENT_TYPE_PATHNAME
  output[1] = start
  output[2] = start
  output[3] = end
  output[4] = end
  output[5] = end
}

/**
 * Recursively parses the segments of the given route tree and populates a segment trie.
 *
 * @param data A reusable Uint16Array for parsing segments. (non important, we're just avoiding allocations)
 * @param route The current route to parse.
 * @param start The starting index for parsing within the route's full path.
 * @param node The current segment node in the trie to populate.
 * @param onRoute Callback invoked for each route processed.
 */
function parseSegments<TRouteLike extends RouteLike>(
  defaultCaseSensitive: boolean,
  data: Uint16Array,
  route: TRouteLike,
  start: number,
  node: AnySegmentNode<TRouteLike>,
  depth: number,
  onRoute?: (route: TRouteLike) => void,
) {
  onRoute?.(route)
  let cursor = start
  {
    const path = route.fullPath ?? route.from
    const length = path.length
    const caseSensitive = route.options?.caseSensitive ?? defaultCaseSensitive
    while (cursor < length) {
      let nextNode: AnySegmentNode<TRouteLike>
      const start = cursor
      parseSegment(path, start, data)
      const end = data[5]!
      cursor = end + 1
      const kind = data[0] as SegmentKind
      switch (kind) {
        case SEGMENT_TYPE_PATHNAME: {
          const value = path.substring(data[2]!, data[3])
          if (caseSensitive) {
            const existingNode = node.static?.get(value)
            if (existingNode) {
              nextNode = existingNode
            } else {
              node.static ??= new Map()
              const next = createStaticNode<TRouteLike>(
                route.fullPath ?? route.from,
              )
              next.parent = node
              next.depth = ++depth
              nextNode = next
              node.static.set(value, next)
            }
          } else {
            const name = value.toLowerCase()
            const existingNode = node.staticInsensitive?.get(name)
            if (existingNode) {
              nextNode = existingNode
            } else {
              node.staticInsensitive ??= new Map()
              const next = createStaticNode<TRouteLike>(
                route.fullPath ?? route.from,
              )
              next.parent = node
              next.depth = ++depth
              nextNode = next
              node.staticInsensitive.set(name, next)
            }
          }
          break
        }
        case SEGMENT_TYPE_PARAM: {
          const prefix_raw = path.substring(start, data[1])
          const suffix_raw = path.substring(data[4]!, end)
          const prefix = !prefix_raw
            ? undefined
            : caseSensitive
              ? prefix_raw
              : prefix_raw.toLowerCase()
          const suffix = !suffix_raw
            ? undefined
            : caseSensitive
              ? suffix_raw
              : suffix_raw.toLowerCase()
          const existingNode = node.dynamic?.find(
            (s) =>
              s.caseSensitive === caseSensitive &&
              s.prefix === prefix &&
              s.suffix === suffix,
          )
          if (existingNode) {
            nextNode = existingNode
          } else {
            const next = createDynamicNode<TRouteLike>(
              SEGMENT_TYPE_PARAM,
              route.fullPath ?? route.from,
              caseSensitive,
              prefix,
              suffix,
            )
            nextNode = next
            next.depth = ++depth
            next.parent = node
            node.dynamic ??= []
            node.dynamic.push(next)
          }
          break
        }
        case SEGMENT_TYPE_OPTIONAL_PARAM: {
          const prefix_raw = path.substring(start, data[1])
          const suffix_raw = path.substring(data[4]!, end)
          const prefix = !prefix_raw
            ? undefined
            : caseSensitive
              ? prefix_raw
              : prefix_raw.toLowerCase()
          const suffix = !suffix_raw
            ? undefined
            : caseSensitive
              ? suffix_raw
              : suffix_raw.toLowerCase()
          const existingNode = node.optional?.find(
            (s) =>
              s.caseSensitive === caseSensitive &&
              s.prefix === prefix &&
              s.suffix === suffix,
          )
          if (existingNode) {
            nextNode = existingNode
          } else {
            const next = createDynamicNode<TRouteLike>(
              SEGMENT_TYPE_OPTIONAL_PARAM,
              route.fullPath ?? route.from,
              caseSensitive,
              prefix,
              suffix,
            )
            nextNode = next
            next.parent = node
            next.depth = ++depth
            node.optional ??= []
            node.optional.push(next)
          }
          break
        }
        case SEGMENT_TYPE_WILDCARD: {
          const prefix_raw = path.substring(start, data[1])
          const suffix_raw = path.substring(data[4]!, end)
          const prefix = !prefix_raw
            ? undefined
            : caseSensitive
              ? prefix_raw
              : prefix_raw.toLowerCase()
          const suffix = !suffix_raw
            ? undefined
            : caseSensitive
              ? suffix_raw
              : suffix_raw.toLowerCase()
          const next = createDynamicNode<TRouteLike>(
            SEGMENT_TYPE_WILDCARD,
            route.fullPath ?? route.from,
            caseSensitive,
            prefix,
            suffix,
          )
          nextNode = next
          next.parent = node
          next.depth = ++depth
          node.wildcard ??= []
          node.wildcard.push(next)
        }
      }
      node = nextNode
    }
    if (route.path || !route.children) node.route = route
  }
  if (route.children)
    for (const child of route.children) {
      parseSegments(
        defaultCaseSensitive,
        data,
        child as TRouteLike,
        cursor,
        node,
        depth,
        onRoute,
      )
    }
}

function sortDynamic(
  a: { prefix?: string; suffix?: string },
  b: { prefix?: string; suffix?: string },
) {
  if (a.prefix && b.prefix && a.prefix !== b.prefix) {
    if (a.prefix.startsWith(b.prefix)) return -1
    if (b.prefix.startsWith(a.prefix)) return 1
  }
  if (a.suffix && b.suffix && a.suffix !== b.suffix) {
    if (a.suffix.endsWith(b.suffix)) return -1
    if (b.suffix.endsWith(a.suffix)) return 1
  }
  if (a.prefix && !b.prefix) return -1
  if (!a.prefix && b.prefix) return 1
  if (a.suffix && !b.suffix) return -1
  if (!a.suffix && b.suffix) return 1
  return 0
}

function sortTreeNodes(node: SegmentNode<RouteLike>) {
  if (node.static) {
    for (const child of node.static.values()) {
      sortTreeNodes(child)
    }
  }
  if (node.staticInsensitive) {
    for (const child of node.staticInsensitive.values()) {
      sortTreeNodes(child)
    }
  }
  if (node.dynamic?.length) {
    node.dynamic.sort(sortDynamic)
    for (const child of node.dynamic) {
      sortTreeNodes(child)
    }
  }
  if (node.optional?.length) {
    node.optional.sort(sortDynamic)
    for (const child of node.optional) {
      sortTreeNodes(child)
    }
  }
  if (node.wildcard?.length) {
    node.wildcard.sort(sortDynamic)
    for (const child of node.wildcard) {
      sortTreeNodes(child)
    }
  }
}

function createStaticNode<T extends RouteLike>(
  fullPath: string,
): StaticSegmentNode<T> {
  return {
    kind: SEGMENT_TYPE_PATHNAME,
    depth: 0,
    static: null,
    staticInsensitive: null,
    dynamic: null,
    optional: null,
    wildcard: null,
    route: null,
    fullPath,
    parent: null,
  }
}

/**
 * Keys must be declared in the same order as in `SegmentNode` type,
 * to ensure they are represented as the same object class in the engine.
 */
function createDynamicNode<T extends RouteLike>(
  kind:
    | typeof SEGMENT_TYPE_PARAM
    | typeof SEGMENT_TYPE_WILDCARD
    | typeof SEGMENT_TYPE_OPTIONAL_PARAM,
  fullPath: string,
  caseSensitive: boolean,
  prefix?: string,
  suffix?: string,
): DynamicSegmentNode<T> {
  return {
    kind,
    depth: 0,
    static: null,
    staticInsensitive: null,
    dynamic: null,
    optional: null,
    wildcard: null,
    route: null,
    fullPath,
    parent: null,
    caseSensitive,
    prefix,
    suffix,
  }
}

type StaticSegmentNode<T extends RouteLike> = SegmentNode<T> & {
  kind: typeof SEGMENT_TYPE_PATHNAME
}

type DynamicSegmentNode<T extends RouteLike> = SegmentNode<T> & {
  kind:
    | typeof SEGMENT_TYPE_PARAM
    | typeof SEGMENT_TYPE_WILDCARD
    | typeof SEGMENT_TYPE_OPTIONAL_PARAM
  prefix?: string
  suffix?: string
  caseSensitive: boolean
}

type AnySegmentNode<T extends RouteLike> =
  | StaticSegmentNode<T>
  | DynamicSegmentNode<T>

type SegmentNode<T extends RouteLike> = {
  kind: SegmentKind

  // Static segments (highest priority)
  static: Map<string, StaticSegmentNode<T>> | null

  // Case insensitive static segments (second highest priority)
  staticInsensitive: Map<string, StaticSegmentNode<T>> | null

  // Dynamic segments ($param)
  dynamic: Array<DynamicSegmentNode<T>> | null

  // Optional dynamic segments ({-$param})
  optional: Array<DynamicSegmentNode<T>> | null

  // Wildcard segments ($ - lowest priority)
  wildcard: Array<DynamicSegmentNode<T>> | null

  // Terminal route (if this path can end here)
  route: T | null

  // The full path for this segment node (will only be valid on leaf nodes)
  fullPath: string

  parent: AnySegmentNode<T> | null

  depth: number
}

// function intoRouteLike(routeTree, parent) {
// 	const route = {
// 		id: routeTree.id,
// 		fullPath: routeTree.fullPath,
// 		path: routeTree.path,
// 		options: routeTree.options && 'caseSensitive' in routeTree.options ? { caseSensitive: routeTree.options.caseSensitive } : undefined,
// 	}
// 	if (routeTree.children) {
// 		route.children = routeTree.children.map(child => intoRouteLike(child, route))
// 	}
// 	return route
// }

type RouteLike = {
  path?: string // relative path from the parent,
  children?: Array<RouteLike> // child routes,
  parentRoute?: RouteLike // parent route,
  options?: {
    caseSensitive?: boolean
  }
} &
  // router tree
  (| { fullPath: string; from?: never } // full path from the root
    // flat route masks list
    | { fullPath?: never; from: string } // full path from the root
  )

export type ProcessedTree<
  TTree extends Extract<RouteLike, { fullPath: string }>,
  TFlat extends Extract<RouteLike, { from: string }>,
  TSingle extends Extract<RouteLike, { from: string }>,
> = {
  /** a representation of the `routeTree` as a segment tree, for performant path matching */
  segmentTree: AnySegmentNode<TTree>
  /** a cache of mini route trees generated from flat route lists, for performant route mask matching */
  flatCache: Map<any, AnySegmentNode<TFlat>>
  /** @deprecated keep until v2 so that `router.matchRoute` can keep not caring about the actual route tree */
  singleCache: Map<any, AnySegmentNode<TSingle>>
}

export function processFlatRouteList<
  TRouteLike extends Extract<RouteLike, { from: string }>,
>(routeList: Array<TRouteLike>) {
  const segmentTree = createStaticNode<TRouteLike>('/')
  const data = new Uint16Array(6)
  for (const route of routeList) {
    parseSegments(false, data, route, 1, segmentTree, 0)
  }
  sortTreeNodes(segmentTree)
  return segmentTree
}

/**
 * Take an arbitrary list of routes, create a tree from them (if it hasn't been created already), and match a path against it.
 */
export function findFlatMatch<T extends Extract<RouteLike, { from: string }>>(
  /** The flat list of routes to match against. This array should be stable, it comes from a route's `routeMasks` option. */
  list: Array<T>,
  /** The path to match. */
  path: string,
  /** The `processedTree` returned by the initial `processRouteTree` call. */
  processedTree: ProcessedTree<any, T, any>,
) {
  let tree = processedTree.flatCache.get(list)
  if (!tree) {
    // flat route lists (routeMasks option) are not eagerly processed,
    // if we haven't seen this list before, process it now
    tree = processFlatRouteList(list)
    processedTree.flatCache.set(list, tree)
  }
  return findMatch(path, tree)
}

/**
 * @deprecated keep until v2 so that `router.matchRoute` can keep not caring about the actual route tree
 */
export function findSingleMatch(
  from: string,
  caseSensitive: boolean,
  fuzzy: boolean,
  path: string,
  processedTree: ProcessedTree<any, any, { from: string }>,
) {
  const key = `${caseSensitive}|${from}`
  let tree = processedTree.singleCache.get(key)
  if (!tree) {
    // single flat routes (router.matchRoute) are not eagerly processed,
    // if we haven't seen this route before, process it now
    tree = createStaticNode<{ from: string }>('/')
    const data = new Uint16Array(6)
    parseSegments(caseSensitive, data, { from }, 1, tree, 0)
    processedTree.singleCache.set(key, tree)
  }
  return findMatch(path, tree, fuzzy)
}

export function findRouteMatch<
  T extends Extract<RouteLike, { fullPath: string }>,
>(
  /** The path to match against the route tree. */
  path: string,
  /** The `processedTree` returned by the initial `processRouteTree` call. */
  processedTree: ProcessedTree<T, any, any>,
  /** If `true`, allows fuzzy matching (partial matches). */
  fuzzy = false,
) {
  return findMatch(path, processedTree.segmentTree, fuzzy)
}

/** Trim trailing slashes (except preserving root '/'). */
export function trimPathRight(path: string) {
  return path === '/' ? path : path.replace(/\/{1,}$/, '')
}

/**
 * Processes a route tree into a segment trie for efficient path matching.
 * Also builds lookup maps for routes by ID and by trimmed full path.
 */
export function processRouteTree<
  TRouteLike extends Extract<RouteLike, { fullPath: string }> & { id: string },
>(
  /** The root of the route tree to process. */
  routeTree: TRouteLike,
  /** Whether matching should be case sensitive by default (overridden by individual route options). */
  caseSensitive: boolean = false,
  /** Optional callback invoked for each route during processing. */
  initRoute?: (route: TRouteLike, index: number) => void,
): {
  /** Should be considered a black box, needs to be provided to all matching functions in this module. */
  processedTree: ProcessedTree<TRouteLike, any, any>
  /** A lookup map of routes by their unique IDs. */
  routesById: Record<string, TRouteLike>
  /** A lookup map of routes by their trimmed full paths. */
  routesByPath: Record<string, TRouteLike>
} {
  const segmentTree = createStaticNode<TRouteLike>(routeTree.fullPath)
  const data = new Uint16Array(6)
  const routesById = {} as Record<string, TRouteLike>
  const routesByPath = {} as Record<string, TRouteLike>
  let index = 0
  parseSegments(caseSensitive, data, routeTree, 1, segmentTree, 0, (route) => {
    initRoute?.(route, index)

    invariant(
      !(route.id in routesById),
      `Duplicate routes found with id: ${String(route.id)}`,
    )

    routesById[route.id] = route

    if (index !== 0 && route.path) {
      const trimmedFullPath = trimPathRight(route.fullPath)
      if (!routesByPath[trimmedFullPath] || route.fullPath.endsWith('/')) {
        routesByPath[trimmedFullPath] = route
      }
    }

    index++
  })
  sortTreeNodes(segmentTree)
  const processedTree: ProcessedTree<TRouteLike, any, any> = {
    segmentTree,
    flatCache: new Map(),
    singleCache: new Map(),
  }
  return {
    processedTree,
    routesById,
    routesByPath,
  }
}

function findMatch<T extends RouteLike>(
  path: string,
  segmentTree: AnySegmentNode<T>,
  fuzzy = false,
): { route: T; params: Record<string, string> } | null {
  const parts = path.split('/')
  const leaf = getNodeMatch(parts, segmentTree, fuzzy)
  if (!leaf) return null
  const params = extractParams(path, parts, leaf)
  if ('**' in leaf) params['**'] = leaf['**']!
  return {
    route: leaf.node.route!,
    params,
  }
}

function extractParams<T extends RouteLike>(
  path: string,
  parts: Array<string>,
  leaf: { node: AnySegmentNode<T>; skipped: number },
) {
  const list = buildBranch(leaf.node)
  let nodeParts: Array<string> | null = null
  const params: Record<string, string> = {}
  for (
    let partIndex = 0, nodeIndex = 0, pathIndex = 0;
    partIndex < parts.length && nodeIndex < list.length;
    partIndex++, nodeIndex++, pathIndex++
  ) {
    const node = list[nodeIndex]!
    const part = parts[partIndex]!
    const currentPathIndex = pathIndex
    pathIndex += part.length
    if (node.kind === SEGMENT_TYPE_PARAM) {
      nodeParts ??= leaf.node.fullPath.split('/')
      const nodePart = nodeParts[nodeIndex]!
      // param name is extracted at match-time so that tree nodes that are identical except for param name can share the same node
      if (node.suffix !== undefined || node.prefix !== undefined) {
        const preLength = node.prefix?.length ?? 0
        const sufLength = node.suffix?.length ?? 0
        const name = nodePart.substring(
          preLength + 2,
          nodePart.length - sufLength - 1,
        )
        params[name] = part.substring(preLength, part.length - sufLength)
      } else {
        const name = nodePart.substring(1)
        params[name] = part
      }
    } else if (node.kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      nodeParts ??= leaf.node.fullPath.split('/')
      const nodePart = nodeParts[nodeIndex]!
      const preLength = node.prefix?.length ?? 0
      const sufLength = node.suffix?.length ?? 0
      const name = nodePart.substring(
        preLength + 3,
        nodePart.length - sufLength - 1,
      )
      // param name is extracted at match-time so that tree nodes that are identical except for param name can share the same node
      if (leaf.skipped & (1 << nodeIndex)) {
        partIndex-- // stay on the same part
        params[name] = ''
        continue
      }
      if (node.suffix || node.prefix) {
        params[name] = part.substring(preLength, part.length - sufLength)
      } else {
        params[name] = part
      }
    } else if (node.kind === SEGMENT_TYPE_WILDCARD) {
      const n = node
      const rest = path.substring(
        currentPathIndex + (n.prefix?.length ?? 0),
        path.length - (n.suffix?.length ?? 0),
      )
      params['*'] = rest
      params._splat = rest
      break
    }
  }
  return params
}

function buildBranch<T extends RouteLike>(node: AnySegmentNode<T>) {
  const list: Array<AnySegmentNode<T>> = Array(node.depth + 1)
  do {
    list[node.depth] = node
    node = node.parent!
  } while (node)
  return list
}

function getNodeMatch<T extends RouteLike>(
  parts: Array<string>,
  segmentTree: AnySegmentNode<T>,
  fuzzy: boolean,
) {
  parts = parts.filter(Boolean)

  type Frame = {
    node: AnySegmentNode<T>
    index: number
    depth: number
    /** Bitmask of skipped optional segments */
    skipped: number
    statics: number
    dynamics: number
    optionals: number
  }

  // use a stack to explore all possible paths (optional params cause branching)
  const stack: Array<Frame> = [
    {
      node: segmentTree,
      index: 0,
      depth: 0,
      skipped: 0,
      statics: 0,
      dynamics: 0,
      optionals: 0,
    },
  ]

  let wildcardMatch: Frame | null = null
  let bestFuzzy: Frame | null = null
  let bestMatch: Frame | null = null

  while (stack.length) {
    // eslint-disable-next-line prefer-const
    let { node, index, skipped, depth, statics, dynamics, optionals } =
      stack.pop()!

    main: while (node) {
      if (index === parts.length) {
        if (!node.route) break
        if (
          !bestMatch ||
          statics > bestMatch.statics ||
          (statics === bestMatch.statics && dynamics > bestMatch.dynamics) ||
          (statics === bestMatch.statics &&
            dynamics === bestMatch.dynamics &&
            optionals > bestMatch.optionals)
        ) {
          bestMatch = {
            node,
            index,
            depth,
            skipped,
            statics,
            dynamics,
            optionals,
          }
          // perfect match, no need to continue
          if (statics === parts.length) return bestMatch
        }
        break
      }

      // In fuzzy mode, track the best partial match we've found so far
      if (
        fuzzy &&
        node.route &&
        (!bestFuzzy ||
          index > bestFuzzy.index ||
          (index === bestFuzzy.index && depth > bestFuzzy.depth))
      ) {
        bestFuzzy = {
          node,
          index,
          depth,
          skipped,
          statics,
          dynamics,
          optionals,
        }
      }

      const part = parts[index]!
      let lowerPart: string

      // 1. Try static match
      if (node.static) {
        const match = node.static.get(part)
        if (match) {
          stack.push({
            node: match,
            index: index + 1,
            skipped,
            depth: depth + 1,
            statics: statics + 1,
            dynamics,
            optionals,
          })
        }
      }

      // 3. Try dynamic match
      if (node.dynamic) {
        for (const segment of node.dynamic) {
          const { prefix, suffix } = segment
          if (prefix || suffix) {
            const casePart = segment.caseSensitive ? part : (lowerPart ??= part.toLowerCase())
            if (prefix && !casePart.startsWith(prefix)) continue
            if (suffix && !casePart.endsWith(suffix)) continue
          }
          stack.push({
            node: segment,
            index: index + 1,
            skipped,
            depth: depth + 1,
            statics,
            dynamics: dynamics + 1,
            optionals,
          })
        }
      }

      // 4. Try optional match
      if (node.optional) {
        const nextDepth = depth + 1
        const nextSkipped = skipped | (1 << nextDepth)
        for (const segment of node.optional) {
          // when skipping, node and depth advance by 1, but index doesn't
          stack.push({
            node: segment,
            index,
            skipped: nextSkipped,
            depth: nextDepth,
            statics,
            dynamics,
            optionals,
          }) // enqueue skipping the optional
        }
        for (const segment of node.optional) {
          const { prefix, suffix } = segment
          if (prefix || suffix) {
            const casePart = segment.caseSensitive ? part : (lowerPart ??= part.toLowerCase())
            if (prefix && !casePart.startsWith(prefix)) continue
            if (suffix && !casePart.endsWith(suffix)) continue
          }
          stack.push({
            node: segment,
            index: index + 1,
            skipped,
            depth: nextDepth,
            statics,
            dynamics,
            optionals: optionals + 1,
          })
        }
      }

      // 5. Try wildcard match
      if (node.wildcard) {
        for (const segment of node.wildcard) {
          const { prefix, suffix } = segment
          if (prefix) {
            const casePart = segment.caseSensitive ? part : (lowerPart ??= part.toLowerCase())
            if (!casePart.startsWith(prefix)) continue
          }
          if (suffix) {
            const lastPart = parts[parts.length - 1]!
            const casePart = segment.caseSensitive ? lastPart : lastPart.toLowerCase()
            if (!casePart.endsWith(suffix)) continue
          }
          // a wildcard match terminates the loop, but we need to continue searching in case there's a longer match
          if (!wildcardMatch || wildcardMatch.index < index) {
            wildcardMatch = {
              node: segment,
              index,
              skipped,
              depth,
              statics,
              dynamics,
              optionals,
            }
          }
          break main
        }
      }

      // 2. Try case insensitive static match
      if (node.staticInsensitive) {
        const match = node.staticInsensitive.get((lowerPart ??= part.toLowerCase()))
        if (match) {
          node = match
          depth++
          index++
          statics++
          continue
        }
      }

      // No match found
      break
    }
  }

  if (bestMatch) return bestMatch

  if (wildcardMatch) return wildcardMatch

  if (fuzzy && bestFuzzy) {
    return {
      node: bestFuzzy.node,
      skipped: bestFuzzy.skipped,
      '**': '/' + parts.slice(bestFuzzy.index).join('/'),
    }
  }

  return null
}
