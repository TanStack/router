import invariant from "tiny-invariant"

export const SEGMENT_TYPE_PATHNAME = 0
export const SEGMENT_TYPE_PARAM = 1
export const SEGMENT_TYPE_WILDCARD = 2
export const SEGMENT_TYPE_OPTIONAL_PARAM = 3

export type SegmentKind = typeof SEGMENT_TYPE_PATHNAME | typeof SEGMENT_TYPE_PARAM | typeof SEGMENT_TYPE_WILDCARD | typeof SEGMENT_TYPE_OPTIONAL_PARAM

const PARAM_W_CURLY_BRACES_RE = /^([^{]*)\{\$([a-zA-Z_$][a-zA-Z0-9_$]*)\}([^}]*)$/ // prefix{$paramName}suffix
const OPTIONAL_PARAM_W_CURLY_BRACES_RE = /^([^{]*)\{-\$([a-zA-Z_$][a-zA-Z0-9_$]*)\}([^}]*)$/ // prefix{-$paramName}suffix
const WILDCARD_W_CURLY_BRACES_RE = /^([^{]*)\{\$\}([^}]*)$/ // prefix{$}suffix

/**
 * Populates the `output` array with the parsed representation of the given `segment` string.
 * - `output[0]` = segment type (0 = pathname, 1 = param, 2 = wildcard, 3 = optional param)
 * - `output[1]` = index of the end of the prefix
 * - `output[2]` = index of the start of the value
 * - `output[3]` = index of the end of the value
 * - `output[4]` = index of the start of the suffix
 * - `output[5]` = index of the end of the segment
 * 
 * @param path The full path string containing the segment.
 * @param start The starting index of the segment within the path.
 * @param output A Uint16Array to populate with the parsed segment data.
 */
export function parseSegment(path: string, start: number, output: Uint16Array) {
	const next = path.indexOf('/', start)
	const end = next === -1 ? path.length : next
	const part = path.substring(start, end)

	if (!part || !part.includes('$')) { // early escape for static pathname
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
		output[0] = SEGMENT_TYPE_WILDCARD
		output[1] = start + prefix.length
		output[2] = start + prefix.length
		output[3] = end - suffix.length
		output[4] = end - suffix.length
		output[5] = end
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
	data: Uint16Array,
	route: TRouteLike,
	start: number,
	node: AnySegmentNode<TRouteLike>,
	depth: number,
	onRoute?: (route: TRouteLike, node: AnySegmentNode<TRouteLike>) => void
) {
	let cursor = start
	{
		const path = route.fullPath ?? route.from
		const length = path.length
		const caseSensitive = route.options?.caseSensitive ?? false
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
							const next = createStaticNode<TRouteLike>(route.fullPath ?? route.from)
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
							const next = createStaticNode<TRouteLike>(route.fullPath ?? route.from)
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
					const prefix = !prefix_raw ? undefined : caseSensitive ? prefix_raw : prefix_raw.toLowerCase()
					const suffix = !suffix_raw ? undefined : caseSensitive ? suffix_raw : suffix_raw.toLowerCase()
					const existingNode = node.dynamic?.find(s => s.caseSensitive === caseSensitive && s.prefix === prefix && s.suffix === suffix)
					if (existingNode) {
						nextNode = existingNode
					} else {
						const next = createDynamicNode<TRouteLike>(SEGMENT_TYPE_PARAM, route.fullPath ?? route.from, caseSensitive, prefix, suffix)
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
					const prefix = !prefix_raw ? undefined : caseSensitive ? prefix_raw : prefix_raw.toLowerCase()
					const suffix = !suffix_raw ? undefined : caseSensitive ? suffix_raw : suffix_raw.toLowerCase()
					const existingNode = node.optional?.find(s => s.caseSensitive === caseSensitive && s.prefix === prefix && s.suffix === suffix)
					if (existingNode) {
						nextNode = existingNode
					} else {
						const next = createDynamicNode<TRouteLike>(SEGMENT_TYPE_OPTIONAL_PARAM, route.fullPath ?? route.from, caseSensitive, prefix, suffix)
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
					const prefix = !prefix_raw ? undefined : caseSensitive ? prefix_raw : prefix_raw.toLowerCase()
					const suffix = !suffix_raw ? undefined : caseSensitive ? suffix_raw : suffix_raw.toLowerCase()
					const next = createDynamicNode<TRouteLike>(SEGMENT_TYPE_WILDCARD, route.fullPath ?? route.from, caseSensitive, prefix, suffix)
					nextNode = next
					next.parent = node
					next.depth = ++depth
					node.wildcard ??= []
					node.wildcard.push(next)
				}
			}
			node = nextNode
		}
		if (route.path || !route.children)
			node.route = route
		onRoute?.(route, node)
	}
	if (route.children) for (const child of route.children) {
		parseSegments(data, child as TRouteLike, cursor, node, depth, onRoute)
	}
}

function sortDynamic(a: { prefix?: string, suffix?: string }, b: { prefix?: string, suffix?: string }) {
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

function createStaticNode<T extends RouteLike>(fullPath: string): StaticSegmentNode<T> {
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
		parent: null
	}
}

/**
 * Keys must be declared in the same order as in `SegmentNode` type,
 * to ensure they are represented as the same object class in the engine.
 */
function createDynamicNode<T extends RouteLike>(kind: typeof SEGMENT_TYPE_PARAM | typeof SEGMENT_TYPE_WILDCARD | typeof SEGMENT_TYPE_OPTIONAL_PARAM, fullPath: string, caseSensitive: boolean, prefix?: string, suffix?: string): DynamicSegmentNode<T> {
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
	kind: typeof SEGMENT_TYPE_PARAM | typeof SEGMENT_TYPE_WILDCARD | typeof SEGMENT_TYPE_OPTIONAL_PARAM
	prefix?: string
	suffix?: string
	caseSensitive: boolean
}

type AnySegmentNode<T extends RouteLike> = StaticSegmentNode<T> | DynamicSegmentNode<T>

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
} & (
		// router tree
		| { fullPath: string, from?: never } // full path from the root
		// flat route masks list
		| { fullPath?: never, from: string } // full path from the root
	)

export function processFlatRouteList<TRouteLike extends RouteLike>(
	routeList: Array<TRouteLike>,
) {
	const segmentTree = createStaticNode<TRouteLike>('/')
	const data = new Uint16Array(6)
	for (const route of routeList) {
		parseSegments(data, route, 1, segmentTree, 1)
	}
	sortTreeNodes(segmentTree)
	return segmentTree
}


/** Trim trailing slashes (except preserving root '/'). */
export function trimPathRight(path: string) {
	return path === '/' ? path : path.replace(/\/{1,}$/, '')
}

export function processRouteTree<TRouteLike extends Extract<RouteLike, { fullPath: string }> & { id: string }>(
	routeTree: TRouteLike,
	initRoute?: (route: TRouteLike, index: number) => void
) {
	const segmentTree = createStaticNode<TRouteLike>(routeTree.fullPath)
	const data = new Uint16Array(6)
	const routesById = {} as Record<string, TRouteLike>
	const routesByPath = {} as Record<string, TRouteLike>
	let index = 0
	parseSegments(data, routeTree, 1, segmentTree, 0, (route, node) => {
		initRoute?.(route, index)

		invariant(
			!(route.id in routesById),
			`Duplicate routes found with id: ${String(route.id)}`,
		)

		routesById[route.id] = route

		if (index !== 0 && route.path) {
			const trimmedFullPath = trimPathRight(route.fullPath)
			if (
				!routesByPath[trimmedFullPath] ||
				route.fullPath.endsWith('/')
			) {
				routesByPath[trimmedFullPath] = route
			}
		}

		index++
	})
	sortTreeNodes(segmentTree)
	return {
		segmentTree,
		routesById,
		routesByPath,
	}
}


export function findMatch<T extends RouteLike>(path: string, segmentTree: AnySegmentNode<T>, fuzzy = false): { route: T, params: Record<string, string> } | null {
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

function extractParams<T extends RouteLike>(path: string, parts: Array<string>, leaf: { node: AnySegmentNode<T>, skipped: number }) {
	const list = buildBranch(leaf.node)
	let nodeParts: Array<string> | null = null
	const params: Record<string, string> = {}
	for (let partIndex = 0, nodeIndex = 0, pathIndex = 0; partIndex < parts.length && nodeIndex < list.length; partIndex++, nodeIndex++, pathIndex++) {
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
				const name = nodePart.substring(preLength + 2, nodePart.length - sufLength - 1)
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
			const name = nodePart.substring(preLength + 3, nodePart.length - sufLength - 1)
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
			params['*'] = path.substring(currentPathIndex + (n.prefix?.length ?? 0), path.length - (n.suffix?.length ?? 0))
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

function getNodeMatch<T extends RouteLike>(parts: Array<string>, segmentTree: AnySegmentNode<T>, fuzzy: boolean) {
	parts = parts.filter(Boolean)

	type Frame = {
		node: AnySegmentNode<T>
		index: number
		depth: number
		/** Bitmask of skipped optional segments */
		skipped: number
	}

	// use a stack to explore all possible paths (optional params cause branching)
	// we use a depth-first search, return the first result found
	const stack: Array<Frame> = [
		{ node: segmentTree, index: 0, depth: 0, skipped: 0 }
	]
	let stackIndex = 0

	let wildcardMatch: Frame | null = null
	let bestFuzzy: Frame | null = null

	while (stackIndex < stack.length) {
		// eslint-disable-next-line prefer-const
		let { node, index, skipped, depth } = stack[stackIndex++]!

		main: while (node && index <= parts.length) {
			if (index === parts.length) {
				if (!node.route) break
				return { node, skipped }
			}

			// In fuzzy mode, track the best partial match we've found so far
			if (fuzzy && node.route && (!bestFuzzy || index > bestFuzzy.index || (index === bestFuzzy.index && depth > bestFuzzy.depth))) {
				bestFuzzy = { node, index, depth, skipped }
			}

			const part = parts[index]!

			// 3. Try dynamic match
			if (node.dynamic) {
				for (const segment of node.dynamic) {
					const { prefix, suffix } = segment
					if (prefix || suffix) {
						const casePart = segment.caseSensitive ? part : part.toLowerCase()
						if (prefix && !casePart.startsWith(prefix)) continue
						if (suffix && !casePart.endsWith(suffix)) continue
					}
					stack.push({ node: segment, index: index + 1, skipped, depth: depth + 1 })
				}
			}

			// 4. Try optional match
			if (node.optional) {
				const nextDepth = depth + 1
				const nextSkipped = skipped | (1 << nextDepth)
				for (const segment of node.optional) {
					// when skipping, node and depth advance by 1, but index doesn't
					stack.push({ node: segment, index, skipped: nextSkipped, depth: nextDepth }) // enqueue skipping the optional
				}
				for (const segment of node.optional) {
					const { prefix, suffix } = segment
					if (prefix || suffix) {
						const casePart = segment.caseSensitive ? part : part.toLowerCase()
						if (prefix && !casePart.startsWith(prefix)) continue
						if (suffix && !casePart.endsWith(suffix)) continue
					}
					stack.push({ node: segment, index: index + 1, skipped, depth: nextDepth })
				}
			}

			// 1. Try static match
			if (node.static) {
				const match = node.static.get(part)
				if (match) {
					node = match
					depth++
					index++
					continue
				}
			}

			// 2. Try case insensitive static match
			if (node.staticInsensitive) {
				const match = node.staticInsensitive.get(part.toLowerCase())
				if (match) {
					node = match
					depth++
					index++
					continue
				}
			}

			// 5. Try wildcard match
			if (node.wildcard) {
				for (const segment of node.wildcard) {
					const { prefix, suffix } = segment
					if (prefix) {
						const casePart = segment.caseSensitive ? part : part.toLowerCase()
						if (!casePart.startsWith(prefix)) continue
					}
					if (suffix) {
						const part = parts[parts.length - 1]!
						const casePart = segment.caseSensitive ? part : part.toLowerCase()
						if (!casePart.endsWith(suffix)) continue
					}
					// a wildcard match terminates the loop, but we need to continue searching in case there's a longer match
					if (!wildcardMatch || (wildcardMatch.index < index)) {
						wildcardMatch = { node: segment, index, skipped, depth }
					}
					break main
				}
			}

			// No match found
			break
		}
	}


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