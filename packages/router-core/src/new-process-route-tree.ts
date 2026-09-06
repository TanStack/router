import { invariant } from './invariant'
import { createSieveCache } from './sieve-cache'
import { last } from './utils'
import type { SieveCache } from './sieve-cache'

export const SEGMENT_TYPE_PATHNAME = 0
export const SEGMENT_TYPE_PARAM = 1
export const SEGMENT_TYPE_WILDCARD = 2
export const SEGMENT_TYPE_OPTIONAL_PARAM = 3
const SEGMENT_TYPE_INDEX = 4
const SEGMENT_TYPE_PATHLESS = 5 // only used in matching to represent pathless routes that need to carry more information

/**
 * All the kinds of segments that can be present in a route path.
 */
export type SegmentKind =
  | typeof SEGMENT_TYPE_PATHNAME
  | typeof SEGMENT_TYPE_PARAM
  | typeof SEGMENT_TYPE_WILDCARD
  | typeof SEGMENT_TYPE_OPTIONAL_PARAM

/**
 * All the kinds of segments that can be present in the segment tree.
 */
type ExtendedSegmentKind =
  | SegmentKind
  | typeof SEGMENT_TYPE_INDEX
  | typeof SEGMENT_TYPE_PATHLESS

type ParsedSegment = Uint16Array & {
  /** segment type (0 = pathname, 1 = param, 2 = wildcard, 3 = optional param) */
  0: SegmentKind
  /** index of the end of the prefix */
  1: number
  /** index of the start of the value */
  2: number
  /** index of the end of the value */
  3: number
  /** index of the start of the suffix */
  4: number
  /** index of the end of the segment */
  5: number
}

/**
 * Populates the `output` array with the parsed representation of the given `segment` string.
 *
 * Usage:
 * ```ts
 * let output
 * let cursor = 0
 * while (cursor < path.length) {
 *   output = parseSegment(path, cursor, output)
 *   const end = output[5]
 *   cursor = end + 1
 * ```
 *
 * `output` is stored outside to avoid allocations during repeated calls. It doesn't need to be typed
 * or initialized, it will be done automatically.
 */
export function parseSegment(
  /** The full path string containing the segment. */
  path: string,
  /** The starting index of the segment within the path. */
  start: number,
  /** A Uint16Array (length: 6) to populate with the parsed segment data. */
  output: Uint16Array = new Uint16Array(6),
): ParsedSegment {
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
    return output as ParsedSegment
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
    return output as ParsedSegment
  }

  // $paramName
  if (part.charCodeAt(0) === 36) {
    output[0] = SEGMENT_TYPE_PARAM
    output[1] = start
    output[2] = start + 1 // skip '$'
    output[3] = end
    output[4] = end
    output[5] = end
    return output as ParsedSegment
  }

  const openBrace = part.indexOf('{')
  let closeBrace
  if (
    openBrace !== -1 &&
    openBrace + 1 < part.length &&
    (closeBrace = part.indexOf('}', openBrace)) !== -1
  ) {
    const firstChar = part.charCodeAt(openBrace + 1)

    // Check for {-$...} (optional param)
    // prefix{-$paramName}suffix
    // /^([^{]*)\{-\$([a-zA-Z_$][a-zA-Z0-9_$]*)\}([^}]*)$/
    if (firstChar === 45) {
      // '-'
      if (
        openBrace + 2 < part.length &&
        part.charCodeAt(openBrace + 2) === 36 // '$'
      ) {
        const paramStart = openBrace + 3
        const paramEnd = closeBrace
        // Validate param name exists
        if (paramStart < paramEnd) {
          output[0] = SEGMENT_TYPE_OPTIONAL_PARAM
          output[1] = start + openBrace
          output[2] = start + paramStart
          output[3] = start + paramEnd
          output[4] = start + closeBrace + 1
          output[5] = end
          return output as ParsedSegment
        }
      }
    } else if (firstChar === 36) {
      // '$'
      const dollarPos = openBrace + 1
      const afterDollar = openBrace + 2
      // Check for {$} (wildcard)
      if (afterDollar === closeBrace) {
        // For wildcard, value should be '$' (from dollarPos to afterDollar)
        // prefix{$}suffix
        // /^([^{]*)\{\$\}([^}]*)$/
        output[0] = SEGMENT_TYPE_WILDCARD
        output[1] = start + openBrace
        output[2] = start + dollarPos
        output[3] = start + afterDollar
        output[4] = start + closeBrace + 1
        output[5] = path.length
        return output as ParsedSegment
      }
      // Regular param {$paramName} - value is the param name (after $)
      // prefix{$paramName}suffix
      // /^([^{]*)\{\$([a-zA-Z_$][a-zA-Z0-9_$]*)\}([^}]*)$/
      output[0] = SEGMENT_TYPE_PARAM
      output[1] = start + openBrace
      output[2] = start + afterDollar
      output[3] = start + closeBrace
      output[4] = start + closeBrace + 1
      output[5] = end
      return output as ParsedSegment
    }
  }

  // fallback to static pathname (should never happen)
  output[0] = SEGMENT_TYPE_PATHNAME
  output[1] = start
  output[2] = start
  output[3] = end
  output[4] = end
  output[5] = end
  return output as ParsedSegment
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
  /** Each dynamic sibling list is recorded once, when it first needs sorting. */
  dynamicListsToSort?: Array<Array<DynamicSegmentNode<TRouteLike>>>,
  onRoute?: (route: TRouteLike) => void,
) {
  onRoute?.(route)
  let cursor = start
  {
    const path = route.fullPath ?? route.from
    const options = route.options
    const length = path.length
    const caseSensitive = options?.caseSensitive ?? defaultCaseSensitive
    const parseParams = options?.params?.parse ?? options?.parseParams
    while (cursor < length) {
      const segment = parseSegment(path, cursor, data)
      let nextNode: AnySegmentNode<TRouteLike>
      const start = cursor
      const end = segment[5]
      cursor = end + 1
      depth++
      const kind = segment[0]
      switch (kind) {
        case SEGMENT_TYPE_PATHNAME: {
          const value = path.substring(segment[2], segment[3])
          let name = value
          let staticChildren: Map<string, StaticSegmentNode<TRouteLike>>
          if (caseSensitive) {
            staticChildren = node.static ??= new Map()
          } else {
            name = value.toLowerCase()
            staticChildren = node.staticInsensitive ??= new Map()
          }
          const existingNode = staticChildren.get(name)
          if (existingNode) {
            nextNode = existingNode
          } else {
            const next = createStaticNode<TRouteLike>(path)
            next.parent = node
            next.depth = depth
            nextNode = next
            staticChildren.set(name, next)
          }
          break
        }
        case SEGMENT_TYPE_PARAM:
        case SEGMENT_TYPE_OPTIONAL_PARAM:
        case SEGMENT_TYPE_WILDCARD: {
          let prefix = path.substring(start, segment[1])
          let suffix = path.substring(segment[4], end)
          const actuallyCaseSensitive = caseSensitive && !!(prefix || suffix)
          if (!caseSensitive) {
            prefix = prefix.toLowerCase()
            suffix = suffix.toLowerCase()
          }
          const siblings =
            kind === SEGMENT_TYPE_PARAM
              ? node.dynamic
              : kind === SEGMENT_TYPE_OPTIONAL_PARAM
                ? node.optional
                : node.wildcard
          const existingNode =
            // Keep wildcard aliases as separate match candidates, even when
            // they have the same shape and no parser.
            kind !== SEGMENT_TYPE_WILDCARD &&
            !parseParams &&
            siblings?.find(
              (s) =>
                !s.parse &&
                s.caseSensitive === actuallyCaseSensitive &&
                s.prefix === prefix &&
                s.suffix === suffix,
            )
          if (existingNode) {
            nextNode = existingNode
          } else {
            const next = createDynamicNode<TRouteLike>(
              kind,
              path,
              actuallyCaseSensitive,
              prefix,
              suffix,
            )
            nextNode = next
            next.parent = node
            next.depth = depth
            let nodes: Array<DynamicSegmentNode<TRouteLike>>
            if (kind === SEGMENT_TYPE_PARAM) {
              nodes = node.dynamic ??= []
            } else if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
              nodes = node.optional ??= []
            } else {
              nodes = node.wildcard ??= []
            }
            nodes.push(next)
            if (nodes.length === 2) {
              dynamicListsToSort?.push(nodes)
            }
          }
          break
        }
      }
      node = nextNode
    }

    // create pathless node
    if (
      parseParams &&
      route.children &&
      !route.isRoot &&
      route.id &&
      route.id.charCodeAt(route.id.lastIndexOf('/') + 1) === 95 /* '_' */
    ) {
      const pathlessNode = createStaticNode<TRouteLike>(path)
      pathlessNode.kind = SEGMENT_TYPE_PATHLESS
      pathlessNode.parent = node
      depth++
      pathlessNode.depth = depth
      node.pathless ??= []
      node.pathless.push(pathlessNode)
      node = pathlessNode
    }

    const isLeaf = (route.path || !route.children) && !route.isRoot
    // create index node
    if (isLeaf && path.endsWith('/')) {
      const indexNode = createStaticNode<TRouteLike>(path)
      indexNode.kind = SEGMENT_TYPE_INDEX
      indexNode.parent = node
      depth++
      indexNode.depth = depth
      node.index = indexNode
      node = indexNode
    }

    node.parse = parseParams ?? null
    node.priority = options?.params?.priority ?? 0

    // make node "matchable"
    if (isLeaf && !node.route) {
      node.route = route
      node.fullPath = path
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
        dynamicListsToSort,
        onRoute,
      )
    }
}

function sortDynamic(
  a: {
    prefix: string
    suffix: string
    caseSensitive: boolean
    parse: null | ((params: Record<string, string>) => unknown)
    priority: number
  },
  b: {
    prefix: string
    suffix: string
    caseSensitive: boolean
    parse: null | ((params: Record<string, string>) => unknown)
    priority: number
  },
) {
  if (a.parse && !b.parse) return -1
  if (!a.parse && b.parse) return 1
  if (a.parse && b.parse && (a.priority || b.priority))
    return b.priority - a.priority
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

  // Equal specificity preserves route declaration order through stable sort.
  return 0
}

function createStaticNode<T extends RouteLike>(
  fullPath: string,
): StaticSegmentNode<T> {
  return {
    kind: SEGMENT_TYPE_PATHNAME,
    depth: 0,
    pathless: null,
    index: null,
    static: null,
    staticInsensitive: null,
    dynamic: null,
    optional: null,
    wildcard: null,
    route: null,
    fullPath,
    parent: null,
    parse: null,
    priority: 0,
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
  prefix: string,
  suffix: string,
): DynamicSegmentNode<T> {
  return {
    kind,
    depth: 0,
    pathless: null,
    index: null,
    static: null,
    staticInsensitive: null,
    dynamic: null,
    optional: null,
    wildcard: null,
    route: null,
    fullPath,
    parent: null,
    parse: null,
    priority: 0,
    caseSensitive,
    prefix,
    suffix,
  }
}

type StaticSegmentNode<T extends RouteLike> = SegmentNode<T> & {
  kind:
    | typeof SEGMENT_TYPE_PATHNAME
    | typeof SEGMENT_TYPE_PATHLESS
    | typeof SEGMENT_TYPE_INDEX
}

type DynamicSegmentNode<T extends RouteLike> = SegmentNode<T> & {
  kind:
    | typeof SEGMENT_TYPE_PARAM
    | typeof SEGMENT_TYPE_WILDCARD
    | typeof SEGMENT_TYPE_OPTIONAL_PARAM
  prefix: string
  suffix: string
  caseSensitive: boolean
}

type AnySegmentNode<T extends RouteLike> =
  | StaticSegmentNode<T>
  | DynamicSegmentNode<T>

type SegmentNode<T extends RouteLike> = {
  kind: ExtendedSegmentKind

  pathless: Array<StaticSegmentNode<T>> | null

  /** Exact index segment (highest priority) */
  index: StaticSegmentNode<T> | null

  /** Static segments (2nd priority) */
  static: Map<string, StaticSegmentNode<T>> | null

  /** Case insensitive static segments (3rd highest priority) */
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

  /** route.options.params.parse function, set on the last node of the route */
  parse: null | ((params: Record<string, string>) => unknown)

  /** route.options.params.priority ?? 0 */
  priority: number
}

type RouteLike = {
  id?: string
  path?: string // relative path from the parent,
  children?: Array<RouteLike> // child routes,
  parentRoute?: RouteLike // parent route,
  isRoot?: boolean
  options?: {
    caseSensitive?: boolean
    parseParams?: (params: Record<string, string>) => unknown
    params?: {
      parse?: (params: Record<string, string>) => unknown
      priority?: number
    }
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
> = {
  /** a representation of the `routeTree` as a segment tree */
  segmentTree: AnySegmentNode<TTree>
  /** a mini route tree generated from the flat `routeMasks` list */
  masksTree: AnySegmentNode<TFlat> | null
  /** a cache of route matches from the `segmentTree` */
  matchCache: SieveCache<string, RouteMatch<TTree> | null>
  /** a cache of route matches from the `masksTree` */
  flatCache: SieveCache<string, ReturnType<typeof findMatch<TFlat>>> | null
}

export function processRouteMasks<
  TRouteLike extends Extract<RouteLike, { from: string }>,
>(routeList: Array<TRouteLike>, processedTree: ProcessedTree<any, TRouteLike>) {
  const segmentTree = createStaticNode<TRouteLike>('/')
  const data = new Uint16Array(6)
  const dynamicListsToSort: Array<Array<DynamicSegmentNode<TRouteLike>>> = []
  for (const route of routeList) {
    parseSegments(false, data, route, 1, segmentTree, 0, dynamicListsToSort)
  }
  for (const nodes of dynamicListsToSort) {
    nodes.sort(sortDynamic)
  }
  processedTree.masksTree = segmentTree
  processedTree.flatCache = createSieveCache<
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
  processedTree: ProcessedTree<any, T>,
) {
  path ||= '/'
  const cached = processedTree.flatCache!.get(path)
  if (cached !== undefined) return cached
  const result = findMatch(path, processedTree.masksTree!)
  processedTree.flatCache!.set(path, result)
  return result
}

type RouteMatch<T extends Extract<RouteLike, { fullPath: string }>> = {
  route: T
  rawParams: Record<string, string>
  branch: ReadonlyArray<T>
  routeParams: ReadonlyArray<Record<string, string> | undefined>
}

export function findRouteMatch<
  T extends Extract<RouteLike, { fullPath: string }>,
>(
  /** The path to match against the route tree. */
  path: string,
  /** The `processedTree` returned by the initial `processRouteTree` call. */
  processedTree: ProcessedTree<T, any>,
  /** If `true`, allows fuzzy matching (partial matches), i.e. which node in the tree would have been an exact match if the `path` had been shorter? */
  fuzzy = false,
): RouteMatch<T> | null {
  const key = fuzzy ? path : `nofuzz\0${path}` // the main use for `findRouteMatch` is fuzzy:true, so we optimize for that case
  const cached = processedTree.matchCache.get(key)
  if (cached !== undefined) return cached
  path ||= '/'
  let result: RouteMatch<T> | null

  try {
    result = findMatch(
      path,
      processedTree.segmentTree,
      fuzzy,
      true,
    ) as RouteMatch<T> | null
  } catch (err) {
    if (err instanceof URIError) {
      result = null
    } else {
      throw err
    }
  }

  processedTree.matchCache.set(key, result)
  return result
}

/** Trim trailing slashes (except preserving root '/'). */
export function trimPathRight(path: string) {
  return path === '/' ? path : path.replace(/\/{1,}$/, '')
}

export interface ProcessRouteTreeResult<
  TRouteLike extends Extract<RouteLike, { fullPath: string }> & { id: string },
> {
  /** Should be considered a black box, needs to be provided to all matching functions in this module. */
  processedTree: ProcessedTree<TRouteLike, any>
  /** A lookup map of routes by their unique IDs. */
  routesById: Record<string, TRouteLike>
  /** A lookup map of routes by their trimmed full paths. */
  routesByPath: Record<string, TRouteLike>
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
): ProcessRouteTreeResult<TRouteLike> {
  const segmentTree = createStaticNode<TRouteLike>(routeTree.fullPath)
  const data = new Uint16Array(6)
  const dynamicListsToSort: Array<Array<DynamicSegmentNode<TRouteLike>>> = []
  const routesById = {} as Record<string, TRouteLike>
  const routesByPath = {} as Record<string, TRouteLike>
  let index = 0
  parseSegments(
    caseSensitive,
    data,
    routeTree,
    1,
    segmentTree,
    0,
    dynamicListsToSort,
    (route) => {
      initRoute?.(route, index)

      if (route.id in routesById) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            `Invariant failed: Duplicate routes found with id: ${String(route.id)}`,
          )
        }

        invariant()
      }

      routesById[route.id] = route

      if (index !== 0 && route.path) {
        const trimmedFullPath = trimPathRight(route.fullPath)
        if (!routesByPath[trimmedFullPath] || route.fullPath.endsWith('/')) {
          routesByPath[trimmedFullPath] = route
        }
      }

      index++
    },
  )
  for (const nodes of dynamicListsToSort) {
    nodes.sort(sortDynamic)
  }
  const processedTree: ProcessedTree<TRouteLike, any> = {
    segmentTree,
    matchCache: createSieveCache<string, RouteMatch<TRouteLike> | null>(1000),
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
  includeRouteParams = false,
): {
  route: T
  /**
   * The raw (unparsed) params extracted from the path.
   * This will be the exhaustive list of all params defined in the route's path.
   */
  rawParams: Record<string, string>
  branch: ReadonlyArray<T>
  routeParams?: ReadonlyArray<Record<string, string> | undefined>
} | null {
  const parts = path.split('/')
  const leaf = getNodeMatch(path, parts, segmentTree, fuzzy)
  if (!leaf) return null
  const routeBranch = includeRouteParams
    ? buildRouteBranch(leaf.node.route!)
    : undefined
  const routeParams: Array<Record<string, string> | undefined> = []
  const rawParams = extractParams(
    path,
    parts,
    { node: leaf.node, skipped: leaf.skipped },
    routeBranch,
    routeParams,
  )
  if (leaf.fuzzyRemainder !== undefined) {
    rawParams['**'] = leaf.fuzzyRemainder
  }
  return {
    route: leaf.node.route!,
    rawParams: rawParams as Record<string, string>,
    branch: routeBranch ?? buildRouteBranch(leaf.node.route!),
    routeParams,
  }
}

type ParamExtractionState = {
  part: number
  node: number
  path: number
  segment: number
}

/**
 * This function is "resumable":
 * The optional `state` resumes extraction from where the previous call stopped
 * and is updated with the new position.
 */
function extractParams<T extends RouteLike>(
  path: string,
  parts: Array<string>,
  leaf: {
    node: AnySegmentNode<T>
    skipped: number
    extract?: ParamExtractionState
    params?: Record<string, unknown>
  },
  routeBranch?: ReadonlyArray<T>,
  routeParams?: Array<Record<string, string> | undefined>,
): Record<string, unknown> {
  const list = buildBranch(leaf.node)
  let nodeParts: Array<string> | null = null
  const rawParams: Record<string, unknown> = Object.assign(
    Object.create(null),
    leaf.params,
  )
  let routeIndex = 0
  let routeRawParams: Record<string, string> | undefined
  /** which segment of the path we're currently processing */
  let partIndex = leaf.extract?.part ?? 0
  /** which node of the route tree branch we're currently processing */
  let nodeIndex = leaf.extract?.node ?? 0
  /** index of the 1st character of the segment we're processing in the path string */
  let pathIndex = leaf.extract?.path ?? 0
  /** which fullPath segment we're currently processing */
  let segmentCount = leaf.extract?.segment ?? 0
  for (
    ;
    nodeIndex < list.length;
    partIndex++, nodeIndex++, pathIndex++, segmentCount++
  ) {
    const node = list[nodeIndex]!
    const done = node.kind === SEGMENT_TYPE_INDEX
    if (done) {
      // index nodes are terminating nodes and have nothing to extract
    } else if (node.kind === SEGMENT_TYPE_PATHLESS) {
      // pathless nodes do not consume a path segment
      segmentCount--
      partIndex--
      pathIndex--
    } else {
      const part = parts[partIndex]
      const currentPathIndex = pathIndex
      if (part) {
        pathIndex += part.length
      }
      nodeParts ??= leaf.node.fullPath.split('/')
      const nodePart = nodeParts[segmentCount]!
      if (node.kind === SEGMENT_TYPE_PARAM) {
        const preLength = node.prefix.length
        // we can't rely on the presence of prefix/suffix to know whether it's curly-braced or not, because `/{$param}/` is valid, but has no prefix/suffix
        const isCurlyBraced = nodePart.charCodeAt(preLength) === 123 // '{'
        // param name is extracted at match-time so that tree nodes that are identical except for param name can share the same node
        if (isCurlyBraced) {
          const sufLength = node.suffix.length
          const name = nodePart.substring(
            preLength + 2,
            nodePart.length - sufLength - 1,
          )
          const value = part!.substring(preLength, part!.length - sufLength)
          const decodedValue = decodeURIComponent(value)
          rawParams[name] = decodedValue
          ;(routeRawParams ??= Object.create(null))[name] = decodedValue
        } else {
          const name = nodePart.substring(1)
          const decodedValue = decodeURIComponent(part!)
          rawParams[name] = decodedValue
          ;(routeRawParams ??= Object.create(null))[name] = decodedValue
        }
      } else if (
        node.kind === SEGMENT_TYPE_OPTIONAL_PARAM &&
        leaf.skipped & (1 << nodeIndex)
      ) {
        partIndex-- // stay on the same part
        pathIndex = currentPathIndex - 1 // undo pathIndex advancement; -1 to account for loop increment
      } else if (node.kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
        const preLength = node.prefix.length
        const sufLength = node.suffix.length
        const name = nodePart.substring(
          preLength + 3,
          nodePart.length - sufLength - 1,
        )
        const value =
          node.suffix || node.prefix
            ? part!.substring(preLength, part!.length - sufLength)
            : part
        if (value) {
          const decodedValue = decodeURIComponent(value)
          rawParams[name] = decodedValue
          ;(routeRawParams ??= Object.create(null))[name] = decodedValue
        }
      } else if (node.kind === SEGMENT_TYPE_WILDCARD) {
        const preLength = node.prefix.length
        const sufLength = node.suffix.length
        const value = path.substring(
          currentPathIndex + preLength,
          path.length - sufLength,
        )
        const splat = decodeURIComponent(value)
        // TODO: Deprecate *
        rawParams['*'] = splat
        rawParams._splat = splat
        const wildcardParams = (routeRawParams ??= Object.create(null))
        wildcardParams['*'] = splat
        wildcardParams._splat = splat
      }
    }

    while (routeBranch && routeIndex < routeBranch.length) {
      const route = routeBranch[routeIndex]!
      if (
        route.fullPath !== '/' &&
        route.fullPath!.split('/').length - 1 > segmentCount
      ) {
        break
      }
      routeParams!.push(routeRawParams)
      routeRawParams = undefined
      routeIndex++
    }
    if (done || node.kind === SEGMENT_TYPE_WILDCARD) {
      break
    }
  }
  leaf.extract = {
    part: partIndex,
    node: nodeIndex,
    path: pathIndex,
    segment: segmentCount,
  }
  return rawParams
}

export function buildRouteBranch<T extends RouteLike>(route: T) {
  const list = [route]
  while (route.parentRoute) {
    route = route.parentRoute as T
    list.push(route)
  }
  list.reverse()
  return list
}

function buildBranch<T extends RouteLike>(node: AnySegmentNode<T>) {
  const list: Array<AnySegmentNode<T>> = Array(node.depth + 1)
  do {
    list[node.depth] = node
    node = node.parent!
  } while (node)
  return list
}

type MatchStackFrame<T extends RouteLike> = {
  node: AnySegmentNode<T>
  /** index of the path segment */
  index: number
  /**
   * Bitmask of skipped optional segments.
   *
   * This is a very performant way of storing an "array of booleans", but it means beyond 32 segments we can't track skipped optionals.
   * If we really really need to support more than 32 segments we can switch to using a `BigInt` here. It's about 2x slower in worst case scenarios.
   */
  skipped: number
  /** positional specificity bitmasks */
  statics: number
  dynamics: number
  optionals: number
  /** intermediary parameter extraction state */
  extract?: ParamExtractionState
  params?: Record<string, unknown>
  fuzzyRemainder?: string
}

function getNodeMatch<T extends RouteLike>(
  path: string,
  parts: Array<string>,
  segmentTree: AnySegmentNode<T>,
  fuzzy: boolean,
): MatchStackFrame<T> | null {
  // quick check for root index
  // this is an optimization, algorithm should work correctly without this block
  if (path === '/' && segmentTree.index) {
    return { node: segmentTree.index, skipped: 0 } as MatchStackFrame<T>
  }

  const trailingSlash = !last(parts)
  const pathIsIndex = trailingSlash && path !== '/'
  const partsLength = parts.length - (trailingSlash ? 1 : 0)

  type Frame = MatchStackFrame<T>

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
      skipped: 0,
      statics: 0,
      dynamics: 0,
      optionals: 0,
    },
  ]

  let bestFuzzy: Frame | null = null
  let bestMatch: Frame | null = null

  while (stack.length) {
    const frame = stack.pop()!
    const { node, index, skipped, statics, dynamics, optionals } = frame
    let { extract, params } = frame

    // Wildcard candidates are pushed speculatively as fallbacks in case a
    // higher-priority wildcard later fails params.parse. If a better wildcard
    // has already validated and become bestMatch, lower-priority wildcard
    // fallbacks cannot win anymore and should not run params.parse.
    if (
      node.kind === SEGMENT_TYPE_WILDCARD &&
      node.route &&
      !isFrameMoreSpecific(bestMatch, frame)
    ) {
      continue
    }

    if (node.parse) {
      const result = validateParseParams(path, parts, frame)
      if (!result) continue
      params = frame.params
      extract = frame.extract
    }

    // In fuzzy mode, track the best partial match we've found so far
    if (
      fuzzy &&
      node.route &&
      node.kind !== SEGMENT_TYPE_INDEX &&
      isFrameMoreSpecific(bestFuzzy, frame)
    ) {
      bestFuzzy = frame
    }

    const isBeyondPath = index === partsLength
    if (isBeyondPath) {
      if (
        node.route &&
        (!pathIsIndex ||
          node.kind === SEGMENT_TYPE_INDEX ||
          node.kind === SEGMENT_TYPE_WILDCARD) &&
        isFrameMoreSpecific(bestMatch, frame)
      ) {
        bestMatch = frame
      }
      // beyond the length of the path parts, only some segment types can match
      if (!node.optional && !node.wildcard && !node.index && !node.pathless)
        continue
    }

    const part = isBeyondPath ? undefined : parts[index]!
    let lowerPart: string

    // 0. Try index match
    if (isBeyondPath && node.index) {
      const indexFrame: Frame = {
        node: node.index,
        index,
        skipped,
        statics,
        dynamics,
        optionals,
        extract,
        params,
      }
      if (!node.index.parse || validateParseParams(path, parts, indexFrame)) {
        // perfect match, no need to continue
        // this is an optimization, algorithm should work correctly without this block
        if (
          !dynamics &&
          !optionals &&
          !skipped &&
          isPerfectStaticMatch(statics, partsLength)
        ) {
          return indexFrame
        }
        if (isFrameMoreSpecific(bestMatch, indexFrame)) {
          // index matches skip the stack because they cannot have children
          bestMatch = indexFrame
        }
      }
    }

    // 5. Try wildcard match
    if (node.wildcard) {
      for (let i = node.wildcard.length - 1; i >= 0; i--) {
        const segment = node.wildcard[i]!
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
          const end = parts.slice(index).join('/')
          const suffixPart = end.slice(-suffix.length)
          const casePart = segment.caseSensitive
            ? suffixPart
            : suffixPart.toLowerCase()
          if (
            casePart !== suffix ||
            end.length - suffix.length < prefix.length
          ) {
            continue
          }
        }
        // wildcard matches consume the rest of the URL and cannot have children
        stack.push({
          node: segment,
          index: partsLength,
          skipped,
          statics,
          dynamics,
          optionals,
          extract,
          params,
        })
      }
    }

    // 4. Try optional match
    if (node.optional) {
      // A skipped optional is keyed by the child node's trie depth.
      const nextSkipped = skipped | (1 << (node.depth + 1))
      for (let i = node.optional.length - 1; i >= 0; i--) {
        const segment = node.optional[i]!
        // when skipping, the node advances by 1, but the index doesn't
        stack.push({
          node: segment,
          index,
          skipped: nextSkipped,
          statics,
          dynamics,
          optionals,
          extract,
          params,
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
            if (
              suffix &&
              casePart.indexOf(suffix, casePart.length - suffix.length) <
                prefix.length
            ) {
              continue
            }
          }
          stack.push({
            node: segment,
            index: index + 1,
            skipped,
            statics,
            dynamics,
            optionals: optionals + segmentScore(partsLength, index),
            extract,
            params,
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
          if (
            suffix &&
            casePart.indexOf(suffix, casePart.length - suffix.length) <
              prefix.length
          ) {
            continue
          }
        }
        stack.push({
          node: segment,
          index: index + 1,
          skipped,
          statics,
          dynamics: dynamics + segmentScore(partsLength, index),
          optionals,
          extract,
          params,
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
          statics: statics + segmentScore(partsLength, index),
          dynamics,
          optionals,
          extract,
          params,
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
          statics: statics + segmentScore(partsLength, index),
          dynamics,
          optionals,
          extract,
          params,
        })
      }
    }

    // 0. Try pathless match
    if (node.pathless) {
      for (let i = node.pathless.length - 1; i >= 0; i--) {
        const segment = node.pathless[i]!
        stack.push({
          node: segment,
          index,
          skipped,
          statics,
          dynamics,
          optionals,
          extract,
          params,
        })
      }
    }
  }

  if (bestMatch) return bestMatch

  if (fuzzy && bestFuzzy) {
    let sliceIndex = bestFuzzy.index
    for (let i = 0; i < bestFuzzy.index; i++) {
      sliceIndex += parts[i]!.length
    }
    const splat = sliceIndex === path.length ? '/' : path.slice(sliceIndex)
    bestFuzzy.fuzzyRemainder = decodeURIComponent(splat)
    return bestFuzzy
  }

  return null
}

function segmentScore(partsLength: number, index: number): number {
  // The specificity scores are bitmasks over consumed URL segments. Earlier
  // URL segments should dominate later ones when comparing scores, so the
  // first real segment gets the highest bit and the last gets bit 0. Since
  // `parts[0]` is the empty string before the leading slash, real URL segments
  // are [1, partsLength), making this segment's bit `partsLength - index - 1`.
  return 2 ** (partsLength - index - 1)
}

function isPerfectStaticMatch(statics: number, partsLength: number): boolean {
  return statics === 2 ** (partsLength - 1) - 1
}

function validateParseParams<T extends RouteLike>(
  path: string,
  parts: Array<string>,
  frame: MatchStackFrame<T>,
) {
  let params: Record<string, unknown>

  try {
    params = extractParams(path, parts, frame)
  } catch {
    return null
  }

  frame.params = params

  try {
    const result = frame.node.parse!(params as Record<string, string>)
    if (result === false) {
      return null
    }
    Object.assign(params, result)
  } catch {
    // Thrown parse errors should be surfaced on the selected match by
    // extractStrictParams, not used as fallback route selection.
  }

  return true
}

function isFrameMoreSpecific(
  // the stack frame previously saved as "best match"
  prev: MatchStackFrame<any> | null,
  // the candidate stack frame
  next: MatchStackFrame<any>,
): boolean {
  if (!prev) return true
  return (
    next.statics > prev.statics ||
    (next.statics === prev.statics &&
      (next.dynamics > prev.dynamics ||
        (next.dynamics === prev.dynamics &&
          (next.optionals > prev.optionals ||
            (next.optionals === prev.optionals &&
              ((next.node.kind === SEGMENT_TYPE_INDEX) >
                (prev.node.kind === SEGMENT_TYPE_INDEX) ||
                ((next.node.kind === SEGMENT_TYPE_INDEX) ===
                  (prev.node.kind === SEGMENT_TYPE_INDEX) &&
                  next.node.depth > prev.node.depth)))))))
  )
}
