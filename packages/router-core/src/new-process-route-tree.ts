import invariant from 'tiny-invariant'
import { createLRUCache } from './lru-cache'
import { last } from './utils'
import type { LRUCache } from './lru-cache'

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
    const total = path.length
    output[0] = SEGMENT_TYPE_WILDCARD
    output[1] = start
    output[2] = start
    output[3] = total
    output[4] = total
    output[5] = total
    return
  }

  // $paramName
  if (part.charCodeAt(0) === 36) {
    output[0] = SEGMENT_TYPE_PARAM
    output[1] = start
    output[2] = start + 1 // skip '$'
    output[3] = end
    output[4] = end
    output[5] = end
    return
  }

  const wildcardBracesMatch = part.match(WILDCARD_W_CURLY_BRACES_RE)
  if (wildcardBracesMatch) {
    const prefix = wildcardBracesMatch[1]!
    const pLength = prefix.length
    output[0] = SEGMENT_TYPE_WILDCARD
    output[1] = start + pLength
    output[2] = start + pLength + 1 // skip '{'
    output[3] = start + pLength + 2 // '$'
    output[4] = start + pLength + 3 // skip '}'
    output[5] = path.length
    return
  }

  const optionalParamBracesMatch = part.match(OPTIONAL_PARAM_W_CURLY_BRACES_RE)
  if (optionalParamBracesMatch) {
    const prefix = optionalParamBracesMatch[1]!
    const paramName = optionalParamBracesMatch[2]!
    const suffix = optionalParamBracesMatch[3]!
    const pLength = prefix.length
    output[0] = SEGMENT_TYPE_OPTIONAL_PARAM
    output[1] = start + pLength
    output[2] = start + pLength + 3 // skip '{-$'
    output[3] = start + pLength + 3 + paramName.length
    output[4] = end - suffix.length
    output[5] = end
    return
  }

  const paramBracesMatch = part.match(PARAM_W_CURLY_BRACES_RE)
  if (paramBracesMatch) {
    const prefix = paramBracesMatch[1]!
    const paramName = paramBracesMatch[2]!
    const suffix = paramBracesMatch[3]!
    const pLength = prefix.length
    output[0] = SEGMENT_TYPE_PARAM
    output[1] = start + pLength
    output[2] = start + pLength + 2 // skip '{$'
    output[3] = start + pLength + 2 + paramName.length
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
      parseSegment(path, cursor, data)
      let nextNode: AnySegmentNode<TRouteLike>
      const start = cursor
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
          const actuallyCaseSensitive =
            caseSensitive && !!(prefix_raw || suffix_raw)
          const prefix = !prefix_raw
            ? undefined
            : actuallyCaseSensitive
              ? prefix_raw
              : prefix_raw.toLowerCase()
          const suffix = !suffix_raw
            ? undefined
            : actuallyCaseSensitive
              ? suffix_raw
              : suffix_raw.toLowerCase()
          const existingNode = node.dynamic?.find(
            (s) =>
              s.caseSensitive === actuallyCaseSensitive &&
              s.prefix === prefix &&
              s.suffix === suffix,
          )
          if (existingNode) {
            nextNode = existingNode
          } else {
            const next = createDynamicNode<TRouteLike>(
              SEGMENT_TYPE_PARAM,
              route.fullPath ?? route.from,
              actuallyCaseSensitive,
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
          const actuallyCaseSensitive =
            caseSensitive && !!(prefix_raw || suffix_raw)
          const prefix = !prefix_raw
            ? undefined
            : actuallyCaseSensitive
              ? prefix_raw
              : prefix_raw.toLowerCase()
          const suffix = !suffix_raw
            ? undefined
            : actuallyCaseSensitive
              ? suffix_raw
              : suffix_raw.toLowerCase()
          const existingNode = node.optional?.find(
            (s) =>
              s.caseSensitive === actuallyCaseSensitive &&
              s.prefix === prefix &&
              s.suffix === suffix,
          )
          if (existingNode) {
            nextNode = existingNode
          } else {
            const next = createDynamicNode<TRouteLike>(
              SEGMENT_TYPE_OPTIONAL_PARAM,
              route.fullPath ?? route.from,
              actuallyCaseSensitive,
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
          const actuallyCaseSensitive =
            caseSensitive && !!(prefix_raw || suffix_raw)
          const prefix = !prefix_raw
            ? undefined
            : actuallyCaseSensitive
              ? prefix_raw
              : prefix_raw.toLowerCase()
          const suffix = !suffix_raw
            ? undefined
            : actuallyCaseSensitive
              ? suffix_raw
              : suffix_raw.toLowerCase()
          const next = createDynamicNode<TRouteLike>(
            SEGMENT_TYPE_WILDCARD,
            route.fullPath ?? route.from,
            actuallyCaseSensitive,
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
    if ((route.path || !route.children) && !route.isRoot) {
      node.route = route
      node.isIndex = path.endsWith('/')
    }
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
  a: { prefix?: string; suffix?: string; caseSensitive: boolean },
  b: { prefix?: string; suffix?: string; caseSensitive: boolean },
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
  if (a.caseSensitive && !b.caseSensitive) return -1
  if (!a.caseSensitive && b.caseSensitive) return 1
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
    isIndex: false,
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
    isIndex: false,
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

  /** Static segments (highest priority) */
  static: Map<string, StaticSegmentNode<T>> | null

  /** Case insensitive static segments (second highest priority) */
  staticInsensitive: Map<string, StaticSegmentNode<T>> | null

  /** Dynamic segments ($param) */
  dynamic: Array<DynamicSegmentNode<T>> | null

  /** Optional dynamic segments ({-$param}) */
  optional: Array<DynamicSegmentNode<T>> | null

  /** Wildcard segments ($ - lowest priority) */
  wildcard: Array<DynamicSegmentNode<T>> | null

  /** Terminal route (if this path can end here) */
  route: T | null

  /** The full path for this segment node (will only be valid on leaf nodes) */
  fullPath: string

  parent: AnySegmentNode<T> | null

  depth: number

  /** is it an index route (trailing / path), only valid for nodes with a `route` */
  isIndex: boolean
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
  isRoot?: boolean
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
  /** a representation of the `routeTree` as a segment tree */
  segmentTree: AnySegmentNode<TTree>
  /** a mini route tree generated from the flat `routeMasks` list */
  masksTree: AnySegmentNode<TFlat> | null
  /** @deprecated keep until v2 so that `router.matchRoute` can keep not caring about the actual route tree */
  singleCache: Map<any, AnySegmentNode<TSingle>>
  /** a cache of route matches from the `segmentTree` */
  matchCache: LRUCache<string, ReturnType<typeof findMatch<TTree>>>
  /** a cache of route matches from the `masksTree` */
  flatCache: LRUCache<string, ReturnType<typeof findMatch<TFlat>>> | null
}

export function processRouteMasks<
  TRouteLike extends Extract<RouteLike, { from: string }>,
>(
  routeList: Array<TRouteLike>,
  processedTree: ProcessedTree<any, TRouteLike, any>,
) {
  const segmentTree = createStaticNode<TRouteLike>('/')
  const data = new Uint16Array(6)
  for (const route of routeList) {
    parseSegments(false, data, route, 1, segmentTree, 0)
  }
  sortTreeNodes(segmentTree)
  processedTree.masksTree = segmentTree
  processedTree.flatCache = createLRUCache<
    string,
    ReturnType<typeof findMatch<TRouteLike>>
  >(1000)
}

/**
 * Take an arbitrary list of routes, create a tree from them (if it hasn't been created already), and match a path against it.
 */
export function findFlatMatch<T extends Extract<RouteLike, { from: string }>>(
  /** The path to match. */
  path: string,
  /** The `processedTree` returned by the initial `processRouteTree` call. */
  processedTree: ProcessedTree<any, T, any>,
) {
  path ||= '/'
  const cached = processedTree.flatCache!.get(path)
  if (cached) return cached
  const result = findMatch(path, processedTree.masksTree!)
  processedTree.flatCache!.set(path, result)
  return result
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
  from ||= '/'
  path ||= '/'
  const key = caseSensitive ? `case|${from}` : from
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
  const key = fuzzy ? `fuzzy|${path}` : path
  const cached = processedTree.matchCache.get(key)
  if (cached) return cached
  path ||= '/'
  const result = findMatch(path, processedTree.segmentTree, fuzzy)
  processedTree.matchCache.set(key, result)
  return result
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
    singleCache: new Map(),
    matchCache: createLRUCache<
      string,
      ReturnType<typeof findMatch<TRouteLike>>
    >(1000),
    flatCache: null,
    masksTree: null,
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
  const leaf = getNodeMatch(path, parts, segmentTree, fuzzy)
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
    nodeIndex < list.length;
    partIndex++, nodeIndex++, pathIndex++
  ) {
    const node = list[nodeIndex]!
    const part = parts[partIndex]
    const currentPathIndex = pathIndex
    if (part) pathIndex += part.length
    if (node.kind === SEGMENT_TYPE_PARAM) {
      nodeParts ??= leaf.node.fullPath.split('/')
      const nodePart = nodeParts[nodeIndex]!
      const preLength = node.prefix?.length ?? 0
      // we can't rely on the presence of prefix/suffix to know whether it's curly-braced or not, because `/{$param}/` is valid, but has no prefix/suffix
      const isCurlyBraced = nodePart.charCodeAt(preLength) === 123 // '{'
      // param name is extracted at match-time so that tree nodes that are identical except for param name can share the same node
      if (isCurlyBraced) {
        const sufLength = node.suffix?.length ?? 0
        const name = nodePart.substring(
          preLength + 2,
          nodePart.length - sufLength - 1,
        )
        params[name] = part!.substring(preLength, part!.length - sufLength)
      } else {
        const name = nodePart.substring(1)
        params[name] = part!
      }
    } else if (node.kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      if (leaf.skipped & (1 << nodeIndex)) {
        partIndex-- // stay on the same part
        continue
      }
      nodeParts ??= leaf.node.fullPath.split('/')
      const nodePart = nodeParts[nodeIndex]!
      const preLength = node.prefix?.length ?? 0
      const sufLength = node.suffix?.length ?? 0
      const name = nodePart.substring(
        preLength + 3,
        nodePart.length - sufLength - 1,
      )
      const value =
        node.suffix || node.prefix
          ? part!.substring(preLength, part!.length - sufLength)
          : part
      if (value?.length) params[name] = value
    } else if (node.kind === SEGMENT_TYPE_WILDCARD) {
      const n = node
      const rest = path.substring(
        currentPathIndex + (n.prefix?.length ?? 0),
        path.length - (n.suffix?.length ?? 0),
      )
      // TODO: Deprecate *
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
  path: string,
  parts: Array<string>,
  segmentTree: AnySegmentNode<T>,
  fuzzy: boolean,
) {
  const trailingSlash = !last(parts)
  const pathIsIndex = trailingSlash && path !== '/'
  const partsLength = parts.length - (trailingSlash ? 1 : 0)

  type Frame = {
    node: AnySegmentNode<T>
    /** index of the segment of path */
    index: number
    /** how many nodes between `node` and the root of the segment tree */
    depth: number
    /**
     * Bitmask of skipped optional segments.
     *
     * This is a very performant way of storing an "array of booleans", but it means beyond 32 segments we can't track skipped optionals.
     * If we really really need to support more than 32 segments we can switch to using a `BigInt` here. It's about 2x slower in worst case scenarios.
     */
    skipped: number
    statics: number
    dynamics: number
    optionals: number
  }

  // use a stack to explore all possible paths (params cause branching)
  // iterate "backwards" (low priority first) so that we can push() each candidate, and pop() the highest priority candidate first
  // - pros: it is depth-first, so we find full matches faster
  // - cons: we cannot short-circuit, because highest priority matches are at the end of the loop (for loop with i--) (but we have no good short-circuiting anyway)
  // other possible approaches:
  // - shift instead of pop (measure performance difference), this allows iterating "forwards" (effectively breadth-first)
  // - never remove from the stack, keep a cursor instead. Then we can push "forwards" and avoid reversing the order of candidates (effectively breadth-first)
  const stack: Array<Frame> = [
    {
      node: segmentTree,
      index: 1,
      depth: 1,
      skipped: 0,
      statics: 1,
      dynamics: 0,
      optionals: 0,
    },
  ]

  let wildcardMatch: Frame | null = null
  let bestFuzzy: Frame | null = null
  let bestMatch: Frame | null = null

  while (stack.length) {
    const frame = stack.pop()!
    // eslint-disable-next-line prefer-const
    let { node, index, skipped, depth, statics, dynamics, optionals } = frame

    const isBeyondPath = index === partsLength
    if (isBeyondPath) {
      if (node.route && (!pathIsIndex || node.isIndex)) {
        if (
          !bestMatch ||
          statics > bestMatch.statics ||
          (statics === bestMatch.statics &&
            (dynamics > bestMatch.dynamics ||
              (dynamics === bestMatch.dynamics &&
                optionals > bestMatch.optionals)))
        ) {
          bestMatch = frame
        }

        // perfect match, no need to continue
        if (statics === partsLength) return bestMatch
      }
      // beyond the length of the path parts, only skipped optional segments or wildcard segments can match
      if (!node.optional && !node.wildcard) continue
    }

    // In fuzzy mode, track the best partial match we've found so far
    if (
      fuzzy &&
      node.route &&
      (!bestFuzzy ||
        index > bestFuzzy.index ||
        (index === bestFuzzy.index && depth > bestFuzzy.depth))
    ) {
      bestFuzzy = frame
    }

    const part = isBeyondPath ? undefined : parts[index]!
    let lowerPart: string

    // 5. Try wildcard match
    if (node.wildcard) {
      for (const segment of node.wildcard) {
        const { prefix, suffix } = segment
        if (prefix) {
          if (isBeyondPath) continue
          const casePart = segment.caseSensitive
            ? part
            : (lowerPart ??= part!.toLowerCase())
          if (!casePart!.startsWith(prefix)) continue
        }
        if (suffix) {
          if (isBeyondPath) continue
          const end = parts.slice(index).join('/').slice(-suffix.length)
          const casePart = segment.caseSensitive ? end : end.toLowerCase()
          if (casePart !== suffix) continue
        }
        // a wildcard match terminates the loop, but we need to continue searching in case there's a longer match
        if (!wildcardMatch || wildcardMatch.index <= index) {
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
        break
      }
    }

    // 4. Try optional match
    if (node.optional) {
      const nextSkipped = skipped | (1 << depth)
      const nextDepth = depth + 1
      for (let i = node.optional.length - 1; i >= 0; i--) {
        const segment = node.optional[i]!
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
      if (!isBeyondPath) {
        for (let i = node.optional.length - 1; i >= 0; i--) {
          const segment = node.optional[i]!
          const { prefix, suffix } = segment
          if (prefix || suffix) {
            const casePart = segment.caseSensitive
              ? part!
              : (lowerPart ??= part!.toLowerCase())
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
    }

    // 3. Try dynamic match
    if (!isBeyondPath && node.dynamic && part) {
      for (let i = node.dynamic.length - 1; i >= 0; i--) {
        const segment = node.dynamic[i]!
        const { prefix, suffix } = segment
        if (prefix || suffix) {
          const casePart = segment.caseSensitive
            ? part
            : (lowerPart ??= part.toLowerCase())
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

    // 2. Try case insensitive static match
    if (!isBeyondPath && node.staticInsensitive) {
      const match = node.staticInsensitive.get(
        (lowerPart ??= part!.toLowerCase()),
      )
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

    // 1. Try static match
    if (!isBeyondPath && node.static) {
      const match = node.static.get(part!)
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
  }

  if (bestMatch && bestMatch.index > 1) return bestMatch

  if (wildcardMatch) return wildcardMatch

  if (fuzzy && bestFuzzy) {
    let sliceIndex = bestFuzzy.index
    for (let i = 0; i < bestFuzzy.index; i++) {
      sliceIndex += parts[i]!.length
    }
    return {
      node: bestFuzzy.node,
      skipped: bestFuzzy.skipped,
      '**': path.slice(sliceIndex),
    }
  }

  return null
}
