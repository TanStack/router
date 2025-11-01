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
		const caseSensitive = route.options?.caseSensitive ?? true
		while (cursor < length) {
			let nextNode: SegmentNode
			const start = cursor
			parseSegment(path, start, data)
			const end = data[5]!
			cursor = end
			const kind = data[0] as SegmentKind
			const value = path.substring(data[2]!, data[3])
			switch (kind) {
				case SEGMENT_TYPE_PATHNAME: {
					const staticName = caseSensitive ? value : value.toLowerCase()
					const existingNode = node.static.find(s => s.caseSensitive === caseSensitive && s.staticName === staticName)
					if (existingNode) {
						nextNode = existingNode.node
					} else {
						nextNode = createEmptyNode()
						node.static.push({
							staticName,
							caseSensitive,
							node: nextNode
						})
					}
					break
				}
				case SEGMENT_TYPE_PARAM: {
					const prefix_raw = path.substring(start, data[1])
					const suffix_raw = path.substring(data[4]!, end)
					const prefix = !prefix_raw ? undefined : caseSensitive ? prefix_raw : prefix_raw.toLowerCase()
					const suffix = !suffix_raw ? undefined : caseSensitive ? suffix_raw : suffix_raw.toLowerCase()
					const existingNode = node.dynamic.find(s => s.caseSensitive === caseSensitive && s.paramName === value && s.prefix === prefix && s.suffix === suffix)
					if (existingNode) {
						nextNode = existingNode.node
					} else {
						nextNode = createEmptyNode()
						node.dynamic.push({
							paramName: value,
							prefix,
							suffix,
							caseSensitive,
							node: nextNode
						})
					}
					break
				}
				case SEGMENT_TYPE_OPTIONAL_PARAM: {
					const prefix_raw = path.substring(start, data[1])
					const suffix_raw = path.substring(data[4]!, end)
					const prefix = !prefix_raw ? undefined : caseSensitive ? prefix_raw : prefix_raw.toLowerCase()
					const suffix = !suffix_raw ? undefined : caseSensitive ? suffix_raw : suffix_raw.toLowerCase()
					const existingNode = node.optional.find(s => s.caseSensitive === caseSensitive && s.paramName === value && s.prefix === prefix && s.suffix === suffix)
					if (existingNode) {
						nextNode = existingNode.node
					} else {
						nextNode = createEmptyNode()
						node.optional.push({
							paramName: value,
							prefix,
							suffix,
							caseSensitive,
							node: nextNode
						})
					}
					break
				}
				case SEGMENT_TYPE_WILDCARD: {
					const prefix_raw = path.substring(start, data[1])
					const suffix_raw = path.substring(data[4]!, end)
					const prefix = !prefix_raw ? undefined : caseSensitive ? prefix_raw : prefix_raw.toLowerCase()
					const suffix = !suffix_raw ? undefined : caseSensitive ? suffix_raw : suffix_raw.toLowerCase()
					node.wildcard = {
						prefix,
						suffix,
					}
					node.route = route
					return
				}
			}
			node = nextNode
		}
		node.route = route
	}
	if (route.children) for (const child of route.children) {
		onRoute(route)
		parseSegments(data, child as TRouteLike, cursor, node, onRoute)
	}
}

function sortStaticSegments(a: SegmentNode['static'][number], b: SegmentNode['static'][number]) {
	if (a.caseSensitive && !b.caseSensitive) return -1
	if (!a.caseSensitive && b.caseSensitive) return 1
	return b.staticName.length - a.staticName.length
}

function sortTreeNodes(node: SegmentNode) {
	if (node.static.length) {
		node.static.sort(sortStaticSegments)
		for (const child of node.static) {
			sortTreeNodes(child.node)
		}
	}
	if (node.dynamic.length) {
		node.dynamic.sort((a, b) => a.paramName.localeCompare(b.paramName)) // TODO
		for (const child of node.dynamic) {
			sortTreeNodes(child.node)
		}
	}
	if (node.optional.length) {
		node.optional.sort((a, b) => a.paramName.localeCompare(b.paramName)) // TODO
		for (const child of node.optional) {
			sortTreeNodes(child.node)
		}
	}
}

function createEmptyNode(): SegmentNode {
	return {
		static: [],
		dynamic: [],
		optional: [],
		wildcard: undefined,
		route: undefined
	}
}


type SegmentNode = {
	// Static segments (highest priority)
	// TODO: maybe we could split this into two maps: caseSensitive and caseInsensitive for faster lookup
	static: Array<{
		staticName: string
		caseSensitive: boolean
		node: SegmentNode
	}>

	// Dynamic segments ($param)
	dynamic: Array<{
		paramName: string
		prefix?: string
		suffix?: string
		caseSensitive: boolean
		node: SegmentNode
	}>

	// Optional dynamic segments ({-$param})
	optional: Array<{
		paramName: string
		prefix?: string
		suffix?: string
		caseSensitive: boolean
		node: SegmentNode
	}>

	// Wildcard segment ($ - lowest priority)
	wildcard?: {
		prefix?: string
		suffix?: string
	}

	// Terminal route (if this path can end here)
	route?: RouteLike
}


type RouteLike = {
	id: string // unique identifier,
	fullPath: string // full path from the root,
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
	const segmentTree = createEmptyNode()
	const data = new Uint16Array(6)
	const routesById = {} as Record<string, TRouteLike>
	const routesByPath = {} as Record<string, TRouteLike>
	let index = 0
	parseSegments(data, routeTree, 0, segmentTree, (route) => {
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