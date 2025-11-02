export const SEGMENT_TYPE_PATHNAME = 0
export const SEGMENT_TYPE_PARAM = 1
export const SEGMENT_TYPE_WILDCARD = 2
export const SEGMENT_TYPE_OPTIONAL_PARAM = 3

type SegmentKind = typeof SEGMENT_TYPE_PATHNAME | typeof SEGMENT_TYPE_PARAM | typeof SEGMENT_TYPE_WILDCARD | typeof SEGMENT_TYPE_OPTIONAL_PARAM

const PARAM_RE = /^\$(.{1,})$/ // $paramName
const PARAM_W_CURLY_BRACES_RE = /^(.*?)\{\$([a-zA-Z_$][a-zA-Z0-9_$]*)\}(.*)$/ // prefix{$paramName}suffix
const OPTIONAL_PARAM_W_CURLY_BRACES_RE = /^(.*?)\{-\$([a-zA-Z_$][a-zA-Z0-9_$]*)\}(.*)$/ // prefix{-$paramName}suffix
const WILDCARD_RE = /^\$$/ // $
const WILDCARD_W_CURLY_BRACES_RE = /^(.*?)\{\$\}(.*)$/ // prefix{$}suffix

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
function parseSegment(path: string, start: number, output: Uint16Array) {
	const next = path.indexOf('/', start)
	const end = next === -1 ? path.length : next
	if (end === start) { // TODO: maybe should never happen?
		// Slash segment
		output[0] = SEGMENT_TYPE_PATHNAME
		output[1] = start
		output[2] = start
		output[3] = end
		output[4] = end
		output[5] = end
		return
	}
	const part = path.substring(start, end)
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
		output[3] = start + prefix.length + paramName.length
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
		output[3] = start + prefix.length + paramName.length
		output[4] = end - suffix.length
		output[5] = end
		return
	}

	const paramMatch = part.match(PARAM_RE)
	if (paramMatch) {
		const paramName = paramMatch[1]!
		output[0] = SEGMENT_TYPE_PARAM
		output[1] = start
		output[2] = start + 1 // skip '$'
		output[3] = start + 1 + paramName.length
		output[4] = end
		output[5] = end
		return
	}

	const wildcardMatch = part.match(WILDCARD_RE)
	if (wildcardMatch) {
		output[0] = SEGMENT_TYPE_WILDCARD
		output[1] = start
		output[2] = start
		output[3] = end
		output[4] = end
		output[5] = end
		return
	}

	// Static pathname segment
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
function parseSegments<TRouteLike extends RouteLike>(data: Uint16Array, route: TRouteLike, start: number, node: SegmentNode, onRoute: (route: TRouteLike) => void) {
	let cursor = start
	{
		const path = route.fullPath
		const length = path.length
		const caseSensitive = route.options?.caseSensitive ?? false
		while (cursor < length) {
			let nextNode: SegmentNode
			const start = cursor
			parseSegment(path, start, data)
			const end = data[5]!
			cursor = end + 1
			const kind = data[0] as SegmentKind
			const value = path.substring(data[2]!, data[3])
			switch (kind) {
				case SEGMENT_TYPE_PATHNAME: {
					if (caseSensitive) {
						const existingNode = node.static?.get(value)
						if (existingNode) {
							nextNode = existingNode
						} else {
							node.static ??= new Map()
							const next = createStaticNode()
							next.parent = node
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
							const next = createStaticNode()
							next.parent = node
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
					const existingNode = node.dynamic?.find(s => s.caseSensitive === caseSensitive && s.name === value && s.prefix === prefix && s.suffix === suffix)
					if (existingNode) {
						nextNode = existingNode
					} else {
						const next = createDynamicNode(value, caseSensitive, prefix, suffix)
						nextNode = next
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
					const existingNode = node.optional?.find(s => s.caseSensitive === caseSensitive && s.name === value && s.prefix === prefix && s.suffix === suffix)
					if (existingNode) {
						nextNode = existingNode
					} else {
						const next = createOptionalNode(value, caseSensitive, prefix, suffix)
						nextNode = next
						nextNode.parent = node
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
					const next = createWildcardNode(caseSensitive, prefix, suffix)
					nextNode = next
					next.parent = node
					node.wildcard = next
					node.routeId = route.id
					return
				}
			}
			node = nextNode
		}
		if (route.path)
			node.routeId = route.id
	}
	if (route.children) for (const child of route.children) {
		onRoute(route)
		parseSegments(data, child as TRouteLike, cursor, node, onRoute)
	}
}

function sortDynamic(a: { prefix?: string, suffix?: string }, b: { prefix?: string, suffix?: string }) {
	const aScore =
		// bonus for having both prefix and suffix
		(a.prefix && a.suffix ? 500 : 0)
		// prefix counts double
		+ (a.prefix ? a.prefix.length * 2 : 0)
		// suffix counts single
		+ (a.suffix ? a.suffix.length : 0)
	const bScore =
		// bonus for having both prefix and suffix
		(b.prefix && b.suffix ? 500 : 0)
		// prefix counts double
		+ (b.prefix ? b.prefix.length * 2 : 0)
		// suffix counts single
		+ (b.suffix ? b.suffix.length : 0)
	return bScore - aScore
}

function sortTreeNodes(node: SegmentNode) {
	if (node.dynamic?.length) {
		node.dynamic.sort(sortDynamic)
		for (const child of node.dynamic) {
			sortTreeNodes(child)
		}
	}
	if (node.optional?.length) {
		node.optional.sort((a, b) => a.name.localeCompare(b.name)) // TODO
		for (const child of node.optional) {
			sortTreeNodes(child)
		}
	}
}

function createStaticNode(): StaticSegmentNode {
	return {
		kind: SEGMENT_TYPE_PATHNAME,
		static: null,
		staticInsensitive: null,
		dynamic: null,
		optional: null,
		wildcard: null,
		routeId: null,
		parent: null
	}
}

function createDynamicNode(name: string, caseSensitive: boolean, prefix?: string, suffix?: string): DynamicSegmentNode {
	return {
		...createStaticNode(),
		kind: SEGMENT_TYPE_PARAM,
		caseSensitive,
		prefix,
		suffix,
		name,
	}
}

function createOptionalNode(name: string, caseSensitive: boolean, prefix?: string, suffix?: string): OptionalSegmentNode {
	return {
		...createStaticNode(),
		kind: SEGMENT_TYPE_OPTIONAL_PARAM,
		caseSensitive,
		prefix,
		suffix,
		name,
	}
}

function createWildcardNode(caseSensitive: boolean, prefix?: string, suffix?: string): WildcardSegmentNode {
	return {
		...createStaticNode(),
		kind: SEGMENT_TYPE_WILDCARD,
		caseSensitive,
		prefix,
		suffix,
	}
}

type StaticSegmentNode = SegmentNode & {
	kind: typeof SEGMENT_TYPE_PATHNAME
}

type DynamicSegmentNode = SegmentNode & {
	kind: typeof SEGMENT_TYPE_PARAM
	name: string
	prefix?: string
	suffix?: string
	caseSensitive: boolean
}

type OptionalSegmentNode = SegmentNode & {
	kind: typeof SEGMENT_TYPE_OPTIONAL_PARAM
	name: string
	prefix?: string
	suffix?: string
	caseSensitive: boolean
}

type WildcardSegmentNode = SegmentNode & {
	kind: typeof SEGMENT_TYPE_WILDCARD
	prefix?: string
	suffix?: string
	caseSensitive: boolean
}


type SegmentNode = {
	kind: SegmentKind

	// Static segments (highest priority)
	static: Map<string, StaticSegmentNode> | null

	// Case insensitive static segments (second highest priority)
	staticInsensitive: Map<string, StaticSegmentNode> | null

	// Dynamic segments ($param)
	dynamic: Array<DynamicSegmentNode> | null

	// Optional dynamic segments ({-$param})
	optional: Array<OptionalSegmentNode> | null

	// Wildcard segment ($ - lowest priority)
	wildcard: WildcardSegmentNode | null

	// Terminal route (if this path can end here)
	routeId: string | null

	parent: SegmentNode | null
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
	id: string // unique identifier,
	fullPath: string // full path from the root,
	path?: string // relative path from the parent,
	children?: Array<RouteLike> // child routes,
	parentRoute?: RouteLike // parent route,
	options?: {
		caseSensitive?: boolean
	}
}

export function processRouteTree<TRouteLike extends RouteLike>({
	routeTree,
	initRoute,
}: {
	routeTree: TRouteLike
	initRoute?: (route: TRouteLike, index: number) => void
}) {
	const segmentTree = createStaticNode()
	const data = new Uint16Array(6)
	const routesById = {} as Record<string, TRouteLike>
	const routesByPath = {} as Record<string, TRouteLike>
	let index = 0
	parseSegments(data, routeTree, 1, segmentTree, (route) => {
		initRoute?.(route, index)
		routesById[route.id] = route
		routesByPath[route.fullPath] = route
		index++
	})
	sortTreeNodes(segmentTree)
	return {
		segmentTree,
		routesById,
		routesByPath,
	}
}


export function findMatch(path: string, segmentTree: SegmentNode): { routeId: string, params: Record<string, string> } | null {
	const parts = path.split('/')
	const leaf = getNodeMatch(parts, segmentTree)
	if (!leaf) return null
	const list = [leaf]
	let node = leaf
	while (node.parent) {
		node = node.parent
		list.push(node)
	}
	list.reverse()
	const params: Record<string, string> = {}
	for (let i = 0; i < parts.length; i++) {
		const node = list[i]!
		if (node.kind === SEGMENT_TYPE_PARAM) {
			const n = node as DynamicSegmentNode
			const part = parts[i]!
			if (n.suffix || n.prefix) {
				params[n.name] = part.substring(n.prefix?.length ?? 0, part.length - (n.suffix?.length ?? 0))
			} else {
				params[n.name] = part
			}
		} else if (node.kind === SEGMENT_TYPE_WILDCARD) {
			const n = node as WildcardSegmentNode
			const part = parts[i]!
			if (n.suffix || n.prefix) {
				params['*'] = part.substring(n.prefix?.length ?? 0, part.length - (n.suffix?.length ?? 0))
			} else {
				params['*'] = part
			}
			break
		}

	}
	return {
		routeId: leaf.routeId!,
		params,
	}
}

function getNodeMatch(parts: Array<string>, segmentTree: SegmentNode) {
	parts = parts.filter(Boolean)
	let node: SegmentNode | null = segmentTree
	let partIndex = 0

	main: while (node && partIndex <= parts.length) {
		if (partIndex === parts.length) {
			if (node.routeId) {
				return node
			}
			return null
		}

		const part = parts[partIndex]!

		// 1. Try static match
		if (node.static) {
			const match = node.static.get(part)
			if (match) {
				node = match
				partIndex++
				continue
			}
		}

		// 2. Try case insensitive static match
		if (node.staticInsensitive) {
			const match = node.staticInsensitive.get(part.toLowerCase())
			if (match) {
				node = match
				partIndex++
				continue
			}
		}

		// 3. Try dynamic match
		if (node.dynamic) {
			for (const segment of node.dynamic) {
				const { prefix, suffix } = segment
				if (prefix || suffix) {
					const casePart = segment.caseSensitive ? part : part.toLowerCase()
					if (prefix && !casePart.startsWith(prefix)) continue
					if (suffix && !casePart.endsWith(suffix)) continue
				}
				node = segment
				partIndex++
				continue main
			}
		}

		// 4. Try wildcard match
		if (node.wildcard) {
			const { prefix, suffix } = node.wildcard
			if (prefix) {
				const casePart = node.wildcard.caseSensitive ? part : part.toLowerCase()
				if (!casePart.startsWith(prefix)) return null
			}
			if (suffix) {
				const part = parts[parts.length - 1]!
				const casePart = node.wildcard.caseSensitive ? part : part.toLowerCase()
				if (!casePart.endsWith(suffix)) return null
			}
			partIndex = parts.length
			continue
		}

		// No match found
		return null
	}

	return null
}