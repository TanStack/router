import { describe, expect, it, test } from 'vitest'
import { format } from "prettier"
import {
  joinPaths,
  matchPathname,
  parsePathname,
  processRouteTree,
} from '../src'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
} from '../src/path'

interface TestRoute {
  id: string
  isRoot?: boolean
  path?: string
  fullPath: string
  rank?: number
  parentRoute?: TestRoute
  children?: Array<TestRoute>
  options?: {
    caseSensitive?: boolean
  }
}

type PathOrChildren = string | [string, Array<PathOrChildren>]

function createRoute(
  pathOrChildren: Array<PathOrChildren>,
  parentPath: string,
): Array<TestRoute> {
  return pathOrChildren.map((route) => {
    if (Array.isArray(route)) {
      const fullPath = joinPaths([parentPath, route[0]])
      const children = createRoute(route[1], fullPath)
      const r = {
        id: fullPath,
        path: route[0],
        fullPath,
        children: children,
      }
      children.forEach((child) => {
        child.parentRoute = r
      })

      return r
    }

    const fullPath = joinPaths([parentPath, route])

    return {
      id: fullPath,
      path: route,
      fullPath,
    }
  })
}

function createRouteTree(pathOrChildren: Array<PathOrChildren>): TestRoute {
  return {
    id: '__root__',
    fullPath: '',
    isRoot: true,
    path: undefined,
    children: createRoute(pathOrChildren, ''),
  }
}

const routeTree = createRouteTree([
  '/',
  '/users/profile/settings', // static-deep (longest static path)
  '/users/profile', // static-medium (medium static path)
  '/api/user-{$id}', // param-with-prefix (param with prefix has higher score)
  '/users/$id', // param-simple (plain param)
  '/posts/{-$slug}', // optional-param (optional param ranks lower than regular param)
  '/files/$', // wildcard (lowest priority)
  '/about', // static-shallow (shorter static path)
  '/a/profile/settings',
  '/a/profile',
  '/a/user-{$id}',
  '/a/$id',
  '/a/{-$slug}',
  '/a/$',
  '/a',
  '/b/profile/settings',
  '/b/profile',
  '/b/user-{$id}',
  '/b/$id',
  '/b/{-$slug}',
  '/b/$',
  '/b',
  '/foo/bar/$id',
  '/foo/$id/bar',
  '/foo/$bar',
  '/foo/$bar/',
  '/foo/{-$bar}/qux',
  '/$id/bar/foo',
  '/$id/foo/bar',
  '/a/b/c/d/e/f',
  '/beep/boop',
  '/one/two',
  '/one',
  '/z/y/x/w',
  '/z/y/x/v',
  '/z/y/x/u',
  '/z/y/x',
  '/images/thumb_{$}', // wildcard with prefix
  '/logs/{$}.txt', // wildcard with suffix
  '/cache/temp_{$}.log', // wildcard with prefix and suffix
])

const result = processRouteTree({ routeTree })

function originalMatcher(from: string, fuzzy?: boolean): readonly [string, Record<string, string>] | undefined {
  let match
  for (const route of result.flatRoutes) {
    const result = matchPathname('/', from, { to: route.fullPath, fuzzy })
    if (result) {
      match = [route.fullPath, result] as const
      break
    }
  }
  return match
}

describe('work in progress', () => {
  it('is ordered', () => {
    expect(result.flatRoutes.map((r) => r.id)).toMatchInlineSnapshot(`
      [
        "/a/b/c/d/e/f",
        "/z/y/x/u",
        "/z/y/x/v",
        "/z/y/x/w",
        "/a/profile/settings",
        "/b/profile/settings",
        "/users/profile/settings",
        "/z/y/x",
        "/foo/bar/$id",
        "/a/profile",
        "/b/profile",
        "/beep/boop",
        "/one/two",
        "/users/profile",
        "/foo/$id/bar",
        "/foo/{-$bar}/qux",
        "/a/user-{$id}",
        "/api/user-{$id}",
        "/b/user-{$id}",
        "/foo/$bar/",
        "/a/$id",
        "/b/$id",
        "/foo/$bar",
        "/users/$id",
        "/a/{-$slug}",
        "/b/{-$slug}",
        "/posts/{-$slug}",
        "/cache/temp_{$}.log",
        "/images/thumb_{$}",
        "/logs/{$}.txt",
        "/a/$",
        "/b/$",
        "/files/$",
        "/a",
        "/about",
        "/b",
        "/one",
        "/",
        "/$id/bar/foo",
        "/$id/foo/bar",
      ]
    `)
  })

  const parsedRoutes = result.flatRoutes.map((route) => ({
    path: route.fullPath,
    segments: parsePathname(route.fullPath),
  }))

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
      if (route.segments.length > 1 && last.type === SEGMENT_TYPE_PATHNAME && last.value === '/') {
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
    | { key: string, type: 'static', index: number, value: string }
    | { key: string, type: 'length', direction: 'eq' | 'gte' | 'lte', value: number }
    | { key: string, type: 'startsWith', index: number, value: string }
    | { key: string, type: 'endsWith', index: number, value: string }
    | { key: string, type: 'globalEndsWith', value: string }

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
          conditions.push({ type: 'static', index: i, value: segment.value, key: `static_${i}_${segment.value}` })
          continue
        }
        if (segment.type === SEGMENT_TYPE_PARAM) {
          minLength += 1
          if (segment.prefixSegment) {
            conditions.push({ type: 'startsWith', index: i, value: segment.prefixSegment, key: `startsWith_${i}_${segment.prefixSegment}` })
          }
          if (segment.suffixSegment) {
            conditions.push({ type: 'endsWith', index: i, value: segment.suffixSegment, key: `endsWith_${i}_${segment.suffixSegment}` })
          }
          continue
        }
        if (segment.type === SEGMENT_TYPE_WILDCARD) {
          hasWildcard = true
          if (segment.prefixSegment) {
            conditions.push({ type: 'startsWith', index: i, value: segment.prefixSegment, key: `startsWith_${i}_${segment.prefixSegment}` })
          }
          if (segment.suffixSegment) {
            conditions.push({ type: 'globalEndsWith', value: segment.suffixSegment, key: `globalEndsWith_${i}_${segment.suffixSegment}` })
          }
          if (segment.suffixSegment || segment.prefixSegment) {
            minLength += 1
          }
          continue
        }
        throw new Error(`Unhandled segment type: ${segment.type}`)
      }

      if (hasWildcard) {
        conditions.push({ type: 'length', direction: 'gte', value: minLength, key: `length_gte_${minLength}` })
      } else {
        conditions.push({ type: 'length', direction: 'eq', value: minLength, key: `length_eq_${minLength}` })
      }

      return {
        ...route,
        conditions,
      }
    })
  }


  // //////////////////////////////////
  // build a flat tree of all routes //
  // //////////////////////////////////

  type LeafNode = { type: 'leaf', conditions: Array<Condition>, route: ParsedRoute, parent: BranchNode | RootNode }
  type RootNode = { type: 'root', children: Array<LeafNode | BranchNode> }
  type BranchNode = { type: 'branch', conditions: Array<Condition>, children: Array<LeafNode | BranchNode>, parent: BranchNode | RootNode }

  const tree: RootNode = { type: 'root', children: [] }
  const all = toConditions(prepareOptionalParams(prepareIndexRoutes(parsedRoutes)))
  for (const { conditions, path, segments } of all) {
    tree.children.push({ type: 'leaf', route: { path, segments }, parent: tree, conditions })
  }

  expandTree(tree)
  contractTree(tree)




  console.log('Tree built with', all.length, 'routes and', tree.children.length, 'top-level nodes')

  /**
   * recursively expand each node of the tree until there is only one child left
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
        const bestCondition = findBestCondition(node, i, node.children.length - i - 1)
        // length-based conditions should try to group as few children as possible
        const bestLength = findBestLength(node, i, 0)

        if (bestCondition.score === Infinity && bestLength.score === Infinity) {
          // no grouping possible, just add the child as is
          resolved.add(child)
          continue
        }

        const selected = bestCondition.score < bestLength.score ? bestCondition : bestLength
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
          if (newNode.children.every((c) => c.conditions.some((sc) => sc.key === condition.key))) {
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
   * recursively shorten branches that have a single child into a leaf node
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
        const lengthConditions = child.conditions.filter(c => c.type === 'length')
        if (lengthConditions.some(c => c.direction === 'eq')) {
          for (const c of lengthConditions) {
            if (c.direction === 'gte') {
              child.conditions = child.conditions.filter(sc => sc.key !== c.key)
            }
          }
        } else if (lengthConditions.length > 0) {
          const minLength = Math.min(...lengthConditions.map(c => c.value))
          child.conditions = child.conditions.filter(c => c.type !== 'length')
          child.conditions.push({ type: 'length', direction: 'eq', value: minLength, key: `length_eq_${minLength}` })
        }
      }
      for (const child of node.children) {
        if (child.type === 'branch') {
          stack.push(child)
        }
      }
    }
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
      str += printConditions(node.conditions)
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

  function printConditions(conditions: Array<Condition>) {
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
    for (const c of segment) {
      results.push(printCondition(c))
    }
    return results.join(' && ')
  }

  function printCondition(condition: Condition) {
    switch (condition.type) {
      case 'static':
        return `s${condition.index} === '${condition.value}'`
      case 'length':
        if (condition.direction === 'eq') {
          return `length(${condition.value})`
        } else if (condition.direction === 'gte') {
          return `l >= ${condition.value}`
        }
        break
      case 'startsWith':
        return `s${condition.index}.startsWith('${condition.value}')`
      case 'endsWith':
        return `s${condition.index}.endsWith('${condition.value}')`
      case 'globalEndsWith':
        return `s[l - 1].endsWith('${condition.value}')`
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

  function findBestCondition(node: RootNode | BranchNode, i: number, target: number) {
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

    return { score: bestMatchScore, condition: bestCondition, candidates: bestCandidates }
  }

  function findBestLength(node: RootNode | BranchNode, i: number, target: number) {
    const child = node.children[i]!
    const childLengthCondition = child.conditions.find(c => c.type === 'length')
    if (!childLengthCondition) {
      return { score: Infinity, condition: undefined, candidates: [child] }
    }
    let currentMinLength = 1
    let exactLength = false
    if (node.type !== 'root') {
      let n = node
      do {
        const lengthCondition = n.conditions.find(c => c.type === 'length')
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
    }
    if (exactLength || currentMinLength >= childLengthCondition.value) {
      return { score: Infinity, condition: undefined, candidates: [child] }
    }
    let bestMatchScore = Infinity
    let bestLength: number | undefined
    let bestCandidates = [child]
    let bestExact = false
    for (let l = currentMinLength + 1; l <= childLengthCondition.value; l++) {
      const candidates = [child]
      let exact = childLengthCondition.direction === 'eq' && l === childLengthCondition.value
      for (let j = i + 1; j < node.children.length; j++) {
        const sibling = node.children[j]!
        const lengthCondition = sibling.conditions.find(c => c.type === 'length')
        if (!lengthCondition) break
        if (lengthCondition.value < l) break
        candidates.push(sibling)
        exact &&= lengthCondition.direction === 'eq' && lengthCondition.value === l
      }
      const score = Math.abs(candidates.length - target)
      if (score < bestMatchScore) {
        bestMatchScore = score
        bestLength = l
        bestCandidates = candidates
        bestExact = exact
      }
    }
    const condition: Condition = { type: 'length', direction: bestExact ? 'eq' : 'gte', value: bestLength!, key: `length_${bestExact ? 'eq' : 'gte'}_${bestLength}` }
    return { score: bestMatchScore, condition, candidates: bestCandidates }
  }

  let fn = 'const s = parsePathname(from[0] === "/" ? from : "/" + from).map((s) => s.value);'
  fn += 'const l = s.length;'
  fn += 'const length = fuzzy ? (n) => l >= n : (n) => l === n;'
  fn += 'const params = fuzzy ? (p, n) => { if (n && l > n) p[\'**\'] = s.slice(n).join(\'/\'); return p } : (p) => p;'
  const max = parsedRoutes.reduce(
    (max, r) => Math.max(max, r.segments.length),
    0,
  )
  if (max > 0) fn += `const [,${Array.from({ length: max }, (_, i) => `s${i + 1}`).join(', ')}] = s;`
  fn += printTree(tree)



  it('generates a matching function', async () => {
    expect(await format(fn, { parser: 'typescript' })).toMatchInlineSnapshot(`
      "const s = parsePathname(from[0] === "/" ? from : "/" + from).map(
        (s) => s.value,
      );
      const l = s.length;
      const length = fuzzy ? (n) => l >= n : (n) => l === n;
      const params = fuzzy
        ? (p, n) => {
            if (n && l > n) p["**"] = s.slice(n).join("/");
            return p;
          }
        : (p) => p;
      const [, s1, s2, s3, s4, s5, s6, s7] = s;
      if (
        length(7) &&
        s1 === "a" &&
        s2 === "b" &&
        s3 === "c" &&
        s4 === "d" &&
        s5 === "e" &&
        s6 === "f"
      )
        return ["/a/b/c/d/e/f", params({}, 7)];
      if (length(5) && s1 === "z" && s2 === "y" && s3 === "x") {
        if (s4 === "u") return ["/z/y/x/u", params({}, 5)];
        if (s4 === "v") return ["/z/y/x/v", params({}, 5)];
        if (s4 === "w") return ["/z/y/x/w", params({}, 5)];
      }
      if (length(4)) {
        if (s2 === "profile" && s3 === "settings") {
          if (s1 === "a") return ["/a/profile/settings", params({}, 4)];
          if (s1 === "b") return ["/b/profile/settings", params({}, 4)];
          if (s1 === "users") return ["/users/profile/settings", params({}, 4)];
        }
        if (s1 === "z" && s2 === "y" && s3 === "x") return ["/z/y/x", params({}, 4)];
        if (s1 === "foo" && s2 === "bar")
          return ["/foo/bar/$id", params({ id: s3 }, 4)];
      }
      if (l >= 3) {
        if (length(3)) {
          if (s2 === "profile") {
            if (s1 === "a") return ["/a/profile", params({}, 3)];
            if (s1 === "b") return ["/b/profile", params({}, 3)];
          }
          if (s1 === "beep" && s2 === "boop") return ["/beep/boop", params({}, 3)];
          if (s1 === "one" && s2 === "two") return ["/one/two", params({}, 3)];
          if (s1 === "users" && s2 === "profile")
            return ["/users/profile", params({}, 3)];
        }
        if (length(4) && s1 === "foo") {
          if (s3 === "bar") return ["/foo/$id/bar", params({ id: s2 }, 4)];
          if (s3 === "qux") return ["/foo/{-$bar}/qux", params({ bar: s2 }, 4)];
        }
        if (length(3)) {
          if (s1 === "foo" && s2 === "qux")
            return ["/foo/{-$bar}/qux", params({}, 3)];
          if (s1 === "a" && s2.startsWith("user-"))
            return ["/a/user-{$id}", params({ id: s2.slice(5) }, 3)];
          if (s1 === "api" && s2.startsWith("user-"))
            return ["/api/user-{$id}", params({ id: s2.slice(5) }, 3)];
          if (s1 === "b" && s2.startsWith("user-"))
            return ["/b/user-{$id}", params({ id: s2.slice(5) }, 3)];
        }
        if (length(4) && s1 === "foo" && s3 === "/")
          return ["/foo/$bar/", params({ bar: s2 }, 4)];
        if (length(3)) {
          if (s1 === "foo") return ["/foo/$bar/", params({ bar: s2 }, 3)];
          if (s1 === "a") return ["/a/$id", params({ id: s2 }, 3)];
          if (s1 === "b") return ["/b/$id", params({ id: s2 }, 3)];
          if (s1 === "foo") return ["/foo/$bar", params({ bar: s2 }, 3)];
          if (s1 === "users") return ["/users/$id", params({ id: s2 }, 3)];
          if (s1 === "a") return ["/a/{-$slug}", params({ slug: s2 }, 3)];
        }
      }
      if (l >= 2) {
        if (length(2) && s1 === "a") return ["/a/{-$slug}", params({}, 2)];
        if (length(3) && s1 === "b") return ["/b/{-$slug}", params({ slug: s2 }, 3)];
        if (length(2) && s1 === "b") return ["/b/{-$slug}", params({}, 2)];
        if (length(3) && s1 === "posts")
          return ["/posts/{-$slug}", params({ slug: s2 }, 3)];
        if (length(2) && s1 === "posts") return ["/posts/{-$slug}", params({}, 2)];
        if (l >= 3) {
          if (s1 === "cache" && s2.startsWith("temp_") && s[l - 1].endsWith(".log"))
            return [
              "/cache/temp_{$}.log",
              {
                _splat: s.slice(2).join("/").slice(5, -4),
                "*": s.slice(2).join("/").slice(5, -4),
              },
            ];
          if (s1 === "images" && s2.startsWith("thumb_"))
            return [
              "/images/thumb_{$}",
              {
                _splat: s.slice(2).join("/").slice(6),
                "*": s.slice(2).join("/").slice(6),
              },
            ];
          if (s1 === "logs" && s[l - 1].endsWith(".txt"))
            return [
              "/logs/{$}.txt",
              {
                _splat: s.slice(2).join("/").slice(0, -4),
                "*": s.slice(2).join("/").slice(0, -4),
              },
            ];
        }
        if (s1 === "a")
          return [
            "/a/$",
            { _splat: s.slice(2).join("/"), "*": s.slice(2).join("/") },
          ];
        if (s1 === "b")
          return [
            "/b/$",
            { _splat: s.slice(2).join("/"), "*": s.slice(2).join("/") },
          ];
        if (s1 === "files")
          return [
            "/files/$",
            { _splat: s.slice(2).join("/"), "*": s.slice(2).join("/") },
          ];
        if (length(2)) {
          if (s1 === "a") return ["/a", params({}, 2)];
          if (s1 === "about") return ["/about", params({}, 2)];
          if (s1 === "b") return ["/b", params({}, 2)];
          if (s1 === "one") return ["/one", params({}, 2)];
        }
      }
      if (length(1)) return ["/", params({}, 1)];
      if (length(4) && s2 === "bar" && s3 === "foo")
        return ["/$id/bar/foo", params({ id: s1 }, 4)];
      if (length(4) && s2 === "foo" && s3 === "bar")
        return ["/$id/foo/bar", params({ id: s1 }, 4)];
      "
    `)
  })

  const buildMatcher = new Function('parsePathname', 'from', 'fuzzy', fn) as (
    parser: typeof parsePathname,
    from: string,
    fuzzy?: boolean
  ) => readonly [path: string, params: Record<string, string>] | undefined

  test.each([
    '',
    '/',
    '/users/profile/settings',
    '/foo/123',
    '/foo/123/',
    '/b/123',
    '/foo/qux',
    '/foo/123/qux',
    '/a/user-123',
    '/a/123',
    '/a/123/more',
    '/files',
    '/files/hello-world.txt',
    '/something/foo/bar',
    '/files/deep/nested/file.json',
    '/files/',
    '/images/thumb_200x300.jpg',
    '/logs/2020/01/01/error.txt',
    '/cache/temp_user456.log',
    '/a/b/c/d/e',
  ])('matching %s', (s) => {
    const originalMatch = originalMatcher(s)
    const buildMatch = buildMatcher(parsePathname, s)
    console.log(
      `matching: ${s}, originalMatch: ${originalMatch?.[0]}, buildMatch: ${buildMatch?.[0]}`,
    )
    expect(buildMatch).toEqual(originalMatch)
  })

  // WARN: some of these don't work yet, they're just here to show the differences
  test.each([
    '/users/profile/settings/hello',
    '/a/b/c/d/e/f/g',
    '/foo/bar/baz',
    '/foo/bar/baz/qux',
  ])('fuzzy matching %s', (s) => {
    const originalMatch = originalMatcher(s, true)
    const buildMatch = buildMatcher(parsePathname, s, true)
    console.log(
      `fuzzy matching: ${s}, originalMatch: ${originalMatch?.[0]}, buildMatch: ${buildMatch?.[0]} ${JSON.stringify(buildMatch?.[1])}`,
    )
    expect(buildMatch).toEqual(originalMatch)
  })
})
