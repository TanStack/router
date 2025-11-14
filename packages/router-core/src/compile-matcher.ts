import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parsePathname,
} from './path'
import type { LRUCache } from './lru-cache'
import type { Segment } from './path'
import type { processRouteTree } from './router'

export type CompiledMatcher = (
  parser: typeof parsePathname,
  from: string,
  fuzzy?: boolean,
  cache?: LRUCache<string, ReadonlyArray<Segment>>,
) => readonly [path: string, params: Record<string, string>] | undefined

/**
 * Compiles a sorted list of routes (as returned by `processRouteTree().flatRoutes`)
 * into a matcher function.
 *
 * Run-time use (requires eval permissions):
 * ```ts
 * const fn = compileMatcher(processRouteTree({ routeTree }).flatRoutes)
 * const matcher = new Function('parsePathname', 'from', 'fuzzy', 'cache', fn) as CompiledMatcher
 * ```
 *
 * Build-time use:
 * ```ts
 * const fn = compileMatcher(processRouteTree({ routeTree }).flatRoutes)
 * sourceCode += `const matcher = (parsePathname, from, fuzzy, cache) => { ${fn} }`
 * ```
 */
export function compileMatcher(
  flatRoutes: ReturnType<typeof processRouteTree>['flatRoutes'],
) {
  const parsedRoutes = flatRoutes.map((route) => ({
    path: route.fullPath,
    segments: parsePathname(route.fullPath),
  }))

  const all = toConditions(
    prepareOptionalParams(prepareIndexRoutes(parsedRoutes)),
  )

  // We start by building a flat tree with all routes as leaf nodes, children of the same root node.
  const tree: RootNode = { type: 'root', children: [] }

  const children: Array<LeafNode> = []
  for (const { conditions, path, segments } of all) {
    children.push({
      type: 'leaf',
      route: { path, segments },
      parent: tree,
      conditions,
    })
  }
  tree.children = removeUnreachable(children)

  expandTree(tree)
  contractTree(tree)

  let fn = ''
  fn += printHead(all)
  fn += printTree(tree)

  return fn
}

type ParsedRoute = {
  path: string
  segments: ReturnType<typeof parsePathname>
}

// we duplicate routes that end in a static `/`, so they're also matched if that final `/` is not present
function prepareIndexRoutes(
  parsedRoutes: Array<ParsedRoute>,
): Array<ParsedRoute> {
  const result: Array<ParsedRoute> = []
  for (const route of parsedRoutes) {
    result.push(route)
    const last = route.segments.at(-1)!
    if (
      route.segments.length > 1 &&
      last.type === SEGMENT_TYPE_PATHNAME &&
      last.value === '/'
    ) {
      const clone: ParsedRoute = {
        ...route,
        segments: route.segments.slice(0, -1),
      }
      result.push(clone)
    }
  }
  return result
}

// we replace routes w/ optional params, with
// - 1 version where it's a regular param
// - 1 version where it's removed entirely
function prepareOptionalParams(
  parsedRoutes: Array<ParsedRoute>,
): Array<ParsedRoute> {
  const result: Array<ParsedRoute> = []
  for (const route of parsedRoutes) {
    const index = route.segments.findIndex(
      (s) => s.type === SEGMENT_TYPE_OPTIONAL_PARAM,
    )
    if (index === -1) {
      result.push(route)
      continue
    }
    // for every optional param in the route, we need to push a version of the route without it, and a version of the route with it as a regular param
    // example:
    // /foo/{-$bar}/qux => [/foo/qux, /foo/$bar/qux]
    // /a/{-$b}/c/{-$d} => [/a/c, /a/c/$d, /a/$b/c, /a/$b/c/$d]
    const withRegular: ParsedRoute = {
      ...route,
      segments: route.segments.map((s, i) =>
        i === index ? { ...s, type: SEGMENT_TYPE_PARAM } : s,
      ),
    }
    const withoutOptional: ParsedRoute = {
      ...route,
      segments: route.segments.filter((_, i) => i !== index),
    }
    const chunk = prepareOptionalParams([withRegular, withoutOptional])
    result.push(...chunk)
  }
  return result
}

type Condition =
  | { key: string; type: 'static'; index: number; value: string; caseSensitive: boolean }
  | { key: string; type: 'length'; direction: 'eq' | 'gte'; value: number }
  | { key: string; type: 'startsWith'; index: number; value: string; caseSensitive: boolean }
  | { key: string; type: 'endsWith'; index: number; value: string; caseSensitive: boolean }
  | { key: string; type: 'globalEndsWith'; value: string; caseSensitive: boolean }

// each segment of a route can have zero or more conditions that need to be met for the route to match
function toConditions(routes: Array<ParsedRoute>) {
  return routes.map((route) => {
    const conditions: Array<Condition> = []

    let hasWildcard = false
    let minLength = 0
    for (let i = 0; i < route.segments.length; i++) {
      const segment = route.segments[i]!
      if (segment.type === SEGMENT_TYPE_PATHNAME) {
        minLength += 1
        if (i === 0 && segment.value === '/') continue // skip leading slash
        // @ts-expect-error -- not typed yet, i don't know how I'm gonna get this value here
        const caseSensitive = route.caseSensitive ?? false
        const value = caseSensitive ? segment.value : segment.value.toLowerCase()
        conditions.push({
          type: 'static',
          index: i,
          value,
          caseSensitive,
          key: `static_${caseSensitive}_${i}_${value}`,
        })
        continue
      }
      if (segment.type === SEGMENT_TYPE_PARAM) {
        minLength += 1
        // @ts-expect-error -- not typed yet, i don't know how I'm gonna get this value here
        const caseSensitive = route.caseSensitive ?? false
        if (segment.prefixSegment) {
          const value = caseSensitive ? segment.prefixSegment : segment.prefixSegment.toLowerCase()
          conditions.push({
            type: 'startsWith',
            index: i,
            value,
            caseSensitive,
            key: `startsWith_${caseSensitive}_${i}_${value}`,
          })
        }
        if (segment.suffixSegment) {
          const value = caseSensitive ? segment.suffixSegment : segment.suffixSegment.toLowerCase()
          conditions.push({
            type: 'endsWith',
            index: i,
            value,
            caseSensitive,
            key: `endsWith_${caseSensitive}_${i}_${value}`,
          })
        }
        continue
      }
      if (segment.type === SEGMENT_TYPE_WILDCARD) {
        hasWildcard = true
        // @ts-expect-error -- not typed yet, i don't know how I'm gonna get this value here
        const caseSensitive = route.caseSensitive ?? false
        if (segment.prefixSegment) {
          const value = caseSensitive ? segment.prefixSegment : segment.prefixSegment.toLowerCase()
          conditions.push({
            type: 'startsWith',
            index: i,
            value,
            caseSensitive,
            key: `startsWith_${caseSensitive}_${i}_${value}`,
          })
        }
        if (segment.suffixSegment) {
          const value = caseSensitive ? segment.suffixSegment : segment.suffixSegment.toLowerCase()
          conditions.push({
            type: 'globalEndsWith',
            value,
            caseSensitive,
            key: `globalEndsWith_${caseSensitive}_${i}_${value}`,
          })
        }
        if (segment.suffixSegment || segment.prefixSegment) {
          minLength += 1
        }
        continue
      }
      throw new Error(`Unhandled segment type: ${segment.type}`)
    }

    if (hasWildcard) {
      conditions.push({
        type: 'length',
        direction: 'gte',
        value: minLength,
        key: `length_gte_${minLength}`,
      })
    } else {
      conditions.push({
        type: 'length',
        direction: 'eq',
        value: minLength,
        key: `length_eq_${minLength}`,
      })
    }

    return {
      ...route,
      conditions,
    }
  })
}

type LeafNode = {
  type: 'leaf'
  conditions: Array<Condition>
  route: ParsedRoute
  parent: BranchNode | RootNode
}
type RootNode = { type: 'root'; children: Array<LeafNode | BranchNode> }
type BranchNode = {
  type: 'branch'
  conditions: Array<Condition>
  children: Array<LeafNode | BranchNode>
  parent: BranchNode | RootNode
}

/**
 * Recursively expand each node of the tree until there is only one child left
 *
 * For each child node in a parent node, we try to find subsequent siblings that would share the same condition to be matched.
 * If we find any, we group them together into a new branch node that replaces the original child node and the grouped siblings in the parent node.
 *
 * We repeat the process in each newly created branch node until there is only one child left in each branch node.
 *
 * This turns
 * ```
 * if (a && b && c && d) return route1;
 * if (a && b && e && f) return route2;
 * ```
 * into
 * ```
 * if (a && b) {
 *   if (c) { if (d) return route1; }
 *   if (e) { if (f) return route2; }
 * }
 * ```
 *
 */
function expandTree(tree: RootNode) {
  const stack: Array<RootNode | BranchNode> = [tree]
  while (stack.length > 0) {
    const node = stack.shift()!
    if (node.children.length <= 1) continue

    const resolved = new Set<BranchNode | LeafNode>()
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!
      if (resolved.has(child)) continue

      // segment-based conditions should try to group as many children as possible
      const bestSegment = findBestSegmentCondition(
        node,
        i,
        node.children.length - i - 1,
      )
      // length-based conditions should try to group as few children as possible
      const bestLength = findBestLengthCondition(node, i, 0)

      if (bestSegment.score === Infinity && bestLength.score === Infinity) {
        // no grouping possible, just add the child as is
        resolved.add(child)
        continue
      }

      const selected =
        bestSegment.score < bestLength.score ? bestSegment : bestLength
      const condition = selected.condition!
      const newNode: BranchNode = {
        type: 'branch',
        conditions: [condition],
        children: selected.candidates,
        parent: node,
      }
      node.children.splice(i, selected.candidates.length, newNode)
      stack.push(newNode)
      resolved.add(newNode)
      for (const c of selected.candidates) {
        c.conditions = c.conditions.filter((sc) => sc.key !== condition.key)
      }

      // find all conditions that are shared by all candidates, and lift them to the new node
      for (const condition of newNode.children[0]!.conditions) {
        if (
          newNode.children.every((c) =>
            c.conditions.some((sc) => sc.key === condition.key),
          )
        ) {
          newNode.conditions.push(condition)
        }
      }
      for (let i = 1; i < newNode.conditions.length; i++) {
        const condition = newNode.conditions[i]!
        for (const c of newNode.children) {
          c.conditions = c.conditions.filter((sc) => sc.key !== condition.key)
        }
      }
    }
  }
}

/**
 * Recursively shorten branches that have a single child into a leaf node.
 *
 * For each branch node in the tree, if it has only one child, we can replace the branch node with that child node,
 * and merge the conditions of the branch node into the child node.
 *
 * This turns
 * `if (a) { if (b) { return route } }`
 * into
 * `if (a && b) { return route }`
 */
function contractTree(tree: RootNode) {
  const stack = tree.children.filter((c) => c.type === 'branch')
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.children.length === 1) {
      const child = node.children[0]!
      node.parent.children.splice(node.parent.children.indexOf(node), 1, child)
      child.parent = node.parent
      child.conditions = [...node.conditions, ...child.conditions]

      // reduce length-based conditions into a single condition
      const lengthConditions = child.conditions.filter(
        (c) => c.type === 'length',
      )
      if (lengthConditions.some((c) => c.direction === 'eq')) {
        for (const c of lengthConditions) {
          if (c.direction === 'gte') {
            child.conditions = child.conditions.filter((sc) => sc.key !== c.key)
          }
        }
      } else if (lengthConditions.length > 0) {
        const minLength = Math.min(...lengthConditions.map((c) => c.value))
        child.conditions = child.conditions.filter((c) => c.type !== 'length')
        child.conditions.push({
          type: 'length',
          direction: 'eq',
          value: minLength,
          key: `length_eq_${minLength}`,
        })
      }
    }
    for (const child of node.children) {
      if (child.type === 'branch') {
        stack.push(child)
      }
    }
  }
}

/**
 * Remove leaves that are not reachable due to the conditions a previous leaf sibling.
 * 
 * This turns
 * ```
 * if (a) return route1;
 * if (a && b) return route2;
 * ```
 * into
 * ```
 * if (a) return route1;
 * ```
 */
function removeUnreachable(nodes: Array<LeafNode>) {
  loop: for (let i = 0; i < nodes.length; i++) {
    const candidate = nodes[i]!

    // look through all previous siblings
    for (let j = 0; j < i; j++) {
      const sibling = nodes[j]!
      // if every condition the sibling requires is also present in the candidate,
      // then that means the candidate is unreachable
      const candidateIsUnreachable = sibling.conditions.every((c) => {
        if (c.type === 'length' && c.direction === 'gte') {
          return candidate.conditions.some((sc) => sc.key === c.key || (sc.type === 'length' && sc.direction === 'eq' && sc.value >= c.value))
        }
        // TODO: we could add other "covering" cases like the one above here,
        // such as the sibling having a `startsWith` condition and the candidate having a static condition that starts with the same value (taking case sensitivity into account)
        return candidate.conditions.some((sc) => sc.key === c.key)
      })
      if (candidateIsUnreachable) {
        nodes.splice(i, 1)
        i -= 1
        continue loop
      }
    }
  }
  return nodes
}

function printTree(node: RootNode | BranchNode | LeafNode) {
  let str = ''
  if (node.type === 'root') {
    for (const child of node.children) {
      str += printTree(child)
    }
    return str
  }
  if (node.conditions.length) {
    str += 'if ('
    str += printConditions(node)
    str += ')'
  }
  if (node.type === 'branch') {
    if (node.conditions.length && node.children.length) str += `{`
    for (const child of node.children) {
      str += printTree(child)
    }
    if (node.conditions.length && node.children.length) str += `}`
  } else {
    str += printRoute(node.route)
  }
  return str
}

function printConditions(node: BranchNode | LeafNode) {
  const conditions = node.conditions
  const lengths = conditions.filter((c) => c.type === 'length')
  const segment = conditions.filter((c) => c.type !== 'length')
  const results: Array<string> = []
  if (lengths.length > 1) {
    const exact = lengths.find((c) => c.direction === 'eq')
    if (exact) {
      results.push(printCondition(exact))
    } else {
      results.push(printCondition(lengths[0]!))
    }
  } else if (lengths.length === 1) {
    results.push(printCondition(lengths[0]!))
  }
  const [minLength] = findLengthAtNode(node)
  for (const c of segment) {
    results.push(printCondition(c, minLength))
  }
  return results.join(' && ')
}

function printCondition(condition: Condition, minLength: number = 0) {
  switch (condition.type) {
    case 'static':
      if (condition.caseSensitive) {
        return `s${condition.index} === '${condition.value}'`
      } else {
        return `sc${condition.index} === '${condition.value}'`
      }
    case 'length':
      if (condition.direction === 'eq') {
        return `length(${condition.value})`
      } else if (condition.direction === 'gte') {
        return `l >= ${condition.value}`
      }
      break
    case 'startsWith':
      if (condition.caseSensitive) {
        return `s${condition.index}.startsWith('${condition.value}')`
      } else if (minLength > condition.index) {
        return `sc${condition.index}.startsWith('${condition.value}')`
      } else {
        return `sc${condition.index}?.startsWith('${condition.value}')`
      }
    case 'endsWith':
      if (condition.caseSensitive) {
        return `s${condition.index}.endsWith('${condition.value}')`
      } else if (minLength > condition.index) {
        return `sc${condition.index}.endsWith('${condition.value}')`
      } else {
        return `sc${condition.index}?.endsWith('${condition.value}')`
      }
    case 'globalEndsWith':
      if (condition.caseSensitive) {
        return `last.endsWith('${condition.value}')`
      } else {
        return `last.toLowerCase().endsWith('${condition.value}')`
      }
  }
  throw new Error(`Unhandled condition type: ${condition.type}`)
}

function printRoute(route: ParsedRoute) {
  const length = route.segments.length
  /**
   * return [
   *   route.path,
   *   { foo: s2, bar: s4 }
   * ]
   */
  let result = `{`
  let hasWildcard = false
  for (let i = 0; i < route.segments.length; i++) {
    const segment = route.segments[i]!
    if (segment.type === SEGMENT_TYPE_PARAM) {
      const name = segment.value.replace(/^\$/, '')
      const value = `s${i}`
      if (segment.prefixSegment && segment.suffixSegment) {
        result += `${name}: ${value}.slice(${segment.prefixSegment.length}, -${segment.suffixSegment.length}), `
      } else if (segment.prefixSegment) {
        result += `${name}: ${value}.slice(${segment.prefixSegment.length}), `
      } else if (segment.suffixSegment) {
        result += `${name}: ${value}.slice(0, -${segment.suffixSegment.length}), `
      } else {
        result += `${name}: ${value}, `
      }
    } else if (segment.type === SEGMENT_TYPE_WILDCARD) {
      hasWildcard = true
      const value = `s.slice(${i}).join('/')`
      if (segment.prefixSegment && segment.suffixSegment) {
        result += `_splat: ${value}.slice(${segment.prefixSegment.length}, -${segment.suffixSegment.length}), `
        result += `'*': ${value}.slice(${segment.prefixSegment.length}, -${segment.suffixSegment.length}), `
      } else if (segment.prefixSegment) {
        result += `_splat: ${value}.slice(${segment.prefixSegment.length}), `
        result += `'*': ${value}.slice(${segment.prefixSegment.length}), `
      } else if (segment.suffixSegment) {
        result += `_splat: ${value}.slice(0, -${segment.suffixSegment.length}), `
        result += `'*': ${value}.slice(0, -${segment.suffixSegment.length}), `
      } else {
        result += `_splat: ${value}, `
        result += `'*': ${value}, `
      }
      break
    }
  }
  result += `}`
  return hasWildcard
    ? `return ['${route.path}', ${result}];`
    : `return ['${route.path}', params(${result}, ${length})];`
}

function printHead(
  routes: Array<ParsedRoute & { conditions: Array<Condition> }>,
) {
  let head =
    'const s = parsePathname(from[0] === "/" ? from : "/" + from, cache).map((s) => s.value);'
  head += 'const l = s.length;'

  // the `length()` function does exact match by default, but greater-than-or-equal match if `fuzzy` is true
  head += 'const length = fuzzy ? (n) => l >= n : (n) => l === n;'

  // the `params()` function returns the params object, and if `fuzzy` is true, it also adds a `**` property with the remaining segments
  head +=
    "const params = fuzzy ? (p, n) => { if (n && l > n) p['**'] = s.slice(n).join('/'); return p } : (p) => p;"

  // extract all segments from the input
  // const [, s1, s2, s3] = s;
  const max = routes.reduce((max, r) => Math.max(max, r.segments.length), 0)
  if (max > 0)
    head += `const [,${Array.from({ length: max - 1 }, (_, i) => `s${i + 1}`).join(', ')}] = s;`

  // add toLowerCase version of each segment that is needed in a case-insensitive match
  // const sc1 = s1?.toLowerCase();
  const caseInsensitiveSegments = new Set<number>()
  for (const route of routes) {
    for (const condition of route.conditions) {
      if ((condition.type === 'static' || condition.type === 'endsWith' || condition.type === 'startsWith') && !condition.caseSensitive) {
        caseInsensitiveSegments.add(condition.index)
      }
    }
  }
  for (const index of caseInsensitiveSegments) {
    head += `const sc${index} = s${index}?.toLowerCase();`
  }

  // wildcard with a suffix requires accessing the last segment, whithout knowing its index
  const hasWildcardWithSuffix = routes.some((route) => route.conditions.some((c) => c.type === 'globalEndsWith'))
  if (hasWildcardWithSuffix) {
    head += 'const last = s[l - 1];'
  }

  return head
}

function findBestSegmentCondition(
  node: RootNode | BranchNode,
  i: number,
  target: number,
) {
  const child = node.children[i]!
  let bestCondition: Condition | undefined
  let bestMatchScore = Infinity
  let bestCandidates = [child]
  for (const c of child.conditions) {
    const candidates = [child]
    for (let j = i + 1; j < node.children.length; j++) {
      const sibling = node.children[j]!
      if (sibling.conditions.some((sc) => sc.key === c.key)) {
        candidates.push(sibling)
      } else {
        break
      }
    }
    const score = Math.abs(candidates.length - target)
    if (score < bestMatchScore) {
      bestMatchScore = score
      bestCondition = c
      bestCandidates = candidates
    }
  }

  return {
    score: bestMatchScore,
    condition: bestCondition,
    candidates: bestCandidates,
  }
}

function findBestLengthCondition(
  node: RootNode | BranchNode,
  i: number,
  target: number,
) {
  const child = node.children[i]!
  const childLengthCondition = child.conditions.find((c) => c.type === 'length')
  if (!childLengthCondition) {
    return { score: Infinity, condition: undefined, candidates: [child] }
  }
  const [currentMinLength, lengthKind] = findLengthAtNode(node)
  if (lengthKind === 'exact' || currentMinLength >= childLengthCondition.value) {
    return { score: Infinity, condition: undefined, candidates: [child] }
  }
  let bestMatchScore = Infinity
  let bestLength: number | undefined
  let bestCandidates = [child]
  let bestExact = false
  for (let l = currentMinLength + 1; l <= childLengthCondition.value; l++) {
    const candidates = [child]
    let exact =
      childLengthCondition.direction === 'eq' &&
      l === childLengthCondition.value
    for (let j = i + 1; j < node.children.length; j++) {
      const sibling = node.children[j]!
      const lengthCondition = sibling.conditions.find(
        (c) => c.type === 'length',
      )
      if (!lengthCondition) break
      if (lengthCondition.value < l) break
      candidates.push(sibling)
      exact &&=
        lengthCondition.direction === 'eq' && lengthCondition.value === l
    }
    const score = Math.abs(candidates.length - target)
    if (score < bestMatchScore) {
      bestMatchScore = score
      bestLength = l
      bestCandidates = candidates
      bestExact = exact
    }
  }
  const condition: Condition = {
    type: 'length',
    direction: bestExact ? 'eq' : 'gte',
    value: bestLength!,
    key: `length_${bestExact ? 'eq' : 'gte'}_${bestLength}`,
  }
  return { score: bestMatchScore, condition, candidates: bestCandidates }
}

function findLengthAtNode(
  node: RootNode | BranchNode | LeafNode,
) {
  if (node.type === 'root') return [1, 'min'] as const
  let currentMinLength = 1
  let exactLength = false
  let n = node
  do {
    const lengthCondition = n.conditions.find((c) => c.type === 'length')
    if (!lengthCondition) continue
    if (lengthCondition.direction === 'eq') {
      exactLength = true
      break
    }
    if (lengthCondition.direction === 'gte') {
      currentMinLength = lengthCondition.value
      break
    }
  } while (n.parent.type === 'branch' && (n = n.parent))
  return [
    currentMinLength,
    exactLength ? 'exact' : 'min',
  ] as const
}