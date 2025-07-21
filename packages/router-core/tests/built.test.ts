import { describe, expect, it, test } from 'vitest'
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
  type Segment,
} from '../src/path'
import { format } from "prettier"

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

function originalMatcher(from: string): string | undefined {
  const match = result.flatRoutes.find((r) =>
    matchPathname('/', from, { to: r.fullPath }),
  )
  return match?.fullPath
}

describe('work in progress', () => {
  it('is ordrered', () => {
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

  const segmentToConditions = (segment: Segment, index: number): Array<string> => {
    if (segment.type === SEGMENT_TYPE_WILDCARD) {
      const conditions = []
      if (segment.prefixSegment) {
        conditions.push(`s${index}.startsWith('${segment.prefixSegment}')`)
      }
      if (segment.suffixSegment) {
        conditions.push(`baseSegments[l - 1].endsWith('${segment.suffixSegment}')`)
      }
      return conditions
    }
    if (segment.type === SEGMENT_TYPE_PARAM || segment.type === SEGMENT_TYPE_OPTIONAL_PARAM) {
      const conditions = []
      if (segment.prefixSegment) {
        conditions.push(`s${index}.startsWith('${segment.prefixSegment}')`)
      }
      if (segment.suffixSegment) {
        conditions.push(`s${index}.endsWith('${segment.suffixSegment}')`)
      }
      return conditions
    }
    if (segment.type === SEGMENT_TYPE_PATHNAME) {
      if (index === 0 && segment.value === '/') return []
      return [`s${index} === '${segment.value}'`]
    }
    throw new Error(`Unknown segment type: ${segment.type}`)
  }

  const routeSegmentsToConditions = (segments: ReadonlyArray<Segment>, startIndex: number, additionalSegments: number = 0) => {
    let hasWildcard = false
    return Array.from({ length: additionalSegments + 1 }).flatMap((_, i) => {
      if (hasWildcard) return '' // Wildcards consume all remaining segments, no check needed
      const segment = segments[startIndex + i]!
      if (segment.type === SEGMENT_TYPE_WILDCARD) {
        hasWildcard = true
      }
      return segmentToConditions(segment, startIndex + i)
    })
      .filter(Boolean)
      .join(' && ')
  }

  const needsSameSegment = (a: Segment, b?: Segment) => {
    if (!b) return false
    const sameStructure = a.type === b.type &&
      a.prefixSegment === b.prefixSegment &&
      a.suffixSegment === b.suffixSegment
    if (a.type === SEGMENT_TYPE_PATHNAME) {
      return sameStructure && a.value === b.value
    }
    return sameStructure
  }

  const groupRoutesInOrder = (candidates: Array<ParsedRoute>, length: number) => {
    // find which (if any) of the routes will be considered fully matched after these checks
    // and sort the other routes into "before the leaf" and "after the leaf", so we can print them in the right order
    const deeperBefore: Array<ParsedRoute> = []
    const deeperAfter: Array<ParsedRoute> = []
    let leaf: ParsedRoute | undefined
    for (const c of candidates) {
      const isLeaf = c.segments.length <= length
      if (isLeaf && !leaf) {
        leaf = c
        continue
      }
      if (isLeaf) {
        continue // ignore subsequent leaves, they can never be matched
      }
      if (!leaf) {
        deeperBefore.push(c)
      } else {
        deeperAfter.push(c)
      }
    }
    return [deeperBefore, leaf, deeperAfter] as const
  }

  function recursiveStaticMatch(
    parsedRoutes: Array<ParsedRoute>,
    depth = 0,
    fixedLength = false,
  ) {
    const resolved = new Set<ParsedRoute>()
    for (let i = 0; i < parsedRoutes.length; i++) {
      const route = parsedRoutes[i]!
      if (resolved.has(route)) continue // already resolved
      const currentSegment = route.segments[depth]
      if (!currentSegment) {
        throw new Error(
          'Implementation error: this should not happen, depth=' +
          depth +
          `, route=${route.path}`,
        )
      }

      // group together all subsequent routes that require the same "next-segment conditions"
      const candidates = [route]
      for (let j = i + 1; j < parsedRoutes.length; j++) {
        const nextRoute = parsedRoutes[j]!
        if (resolved.has(nextRoute)) continue // already resolved
        const routeSegment = nextRoute.segments[depth]
        if (needsSameSegment(currentSegment, routeSegment)) {
          candidates.push(nextRoute)
        } else {
          break // no more candidates in this group
        }
      }

      outputConditionGroup: if (candidates.length > 1) {
        // Determine how many segments the routes in this group have in common
        let skipDepth = route.segments.slice(depth + 1).findIndex((s, i) =>
          candidates.some((c) => !needsSameSegment(s, c.segments[depth + 1 + i])),
        )
        // If no segment differ at all, match everything
        if (skipDepth === -1) skipDepth = route.segments.length - depth - 1

        const lCondition =
          !fixedLength && (skipDepth || (depth > 0)) ? `l > ${depth + skipDepth}` : ''

        // Accumulate all the conditions for all segments in the group
        const skipConditions = routeSegmentsToConditions(candidates[0]!.segments, depth, skipDepth)
        if (!skipConditions) { // we grouped by "next-segment conditions", but this didn't result in any conditions, bail out
          candidates.length = 1
          break outputConditionGroup
        }

        const [deeperBefore, leaf, deeperAfter] = groupRoutesInOrder(candidates, depth + 1 + skipDepth)
        const hasCondition = Boolean(lCondition || skipConditions) && (deeperBefore.length > 0 || deeperAfter.length > 0)
        if (hasCondition) {
          fn += `if (${lCondition}${lCondition && skipConditions ? ' && ' : ''}${skipConditions}) {`
        }
        if (deeperBefore.length > 0) {
          recursiveStaticMatch(
            deeperBefore,
            depth + 1 + skipDepth,
            fixedLength,
          )
        }
        if (leaf) {
          if (fixedLength) {
            fn += `return '${leaf.path}';`
          } else {
            fn += `if (l === ${leaf.segments.length}) return '${leaf.path}';`
          }
        }
        if (deeperAfter.length > 0 && !(leaf && fixedLength)) {
          recursiveStaticMatch(
            deeperAfter,
            depth + 1 + skipDepth,
            fixedLength,
          )
        }
        if (hasCondition) {
          fn += '}'
        }
        candidates.forEach((c) => resolved.add(c))
        continue
      }


      const wildcardIndex = route.segments.findIndex(
        (s) => s && s.type === SEGMENT_TYPE_WILDCARD,
      )
      if (wildcardIndex > -1 && wildcardIndex < depth) {
        throw new Error(
          `Implementation error: wildcard segment at index ${wildcardIndex} cannot be before depth ${depth} in route ${route.path}`,
        )
      }

      // couldn't group by segment, try grouping by length (exclude wildcard routes because of their variable length)
      if (wildcardIndex === -1 && !fixedLength) {
        for (let j = i + 1; j < parsedRoutes.length; j++) {
          const nextRoute = parsedRoutes[j]!
          if (resolved.has(nextRoute)) continue // already resolved
          if (nextRoute.segments.length === route.segments.length && !nextRoute.segments.some((s) => s.type === SEGMENT_TYPE_WILDCARD)) {
            candidates.push(nextRoute)
          } else {
            break // no more candidates in this group
          }
        }
        if (candidates.length > 1) {
          const [deeperBefore, leaf, deeperAfter] = groupRoutesInOrder(candidates, route.segments.length)
          if (leaf && deeperBefore.length || leaf && deeperAfter.length) {
            throw new Error(`Implementation error: length-based leaf route ${leaf.path} should not have deeper routes, but has ${deeperBefore.length} before and ${deeperAfter.length} after`)
          }
          fn += `if (l === ${route.segments.length}) {`
          recursiveStaticMatch(
            candidates,
            depth,
            true
          )
          fn += '}'
          candidates.forEach((c) => resolved.add(c))
          continue
        }
      }

      // try grouping wildcard routes that would have the same base length
      if (wildcardIndex > -1 && !fixedLength) {
        for (let j = i + 1; j < parsedRoutes.length; j++) {
          const nextRoute = parsedRoutes[j]!
          if (resolved.has(nextRoute)) continue // already resolved
          if (nextRoute.segments.length === route.segments.length && wildcardIndex === nextRoute.segments.findIndex((s) => s.type === SEGMENT_TYPE_WILDCARD)) {
            candidates.push(nextRoute)
          } else {
            break // no more candidates in this group
          }
        }
        if (candidates.length > 2) {
          const [deeperBefore, leaf, deeperAfter] = groupRoutesInOrder(candidates, route.segments.length)
          if (leaf && deeperBefore.length || leaf && deeperAfter.length) {
            throw new Error(`Implementation error: wildcard-based leaf route ${leaf.path} should not have deeper routes, but has ${deeperBefore.length} before and ${deeperAfter.length} after`)
          }
          fn += `if (l >= ${wildcardIndex}) {`
          recursiveStaticMatch(
            candidates,
            depth,
            true
          )
          fn += '}'
          candidates.forEach((c) => resolved.add(c))
          continue
        }
      }

      // couldn't group at all, just output a single-route match, and let the next iteration handle the rest
      if (wildcardIndex === -1) {
        const conditions = routeSegmentsToConditions(route.segments, depth, route.segments.length - depth - 1)
        const lCondition = fixedLength ? '' : `l === ${route.segments.length}`
        fn += `if (${lCondition}${lCondition && conditions ? ' && ' : ''}${conditions}) return '${route.path}';`
      } else {
        const conditions = routeSegmentsToConditions(route.segments, depth, wildcardIndex - depth)
        const lCondition = fixedLength ? '' : `l >= ${wildcardIndex}`
        fn += `if (${lCondition}${lCondition && conditions ? ' && ' : ''}${conditions}) return '${route.path}';`
      }
      resolved.add(route)
    }
  }

  let fn = 'const baseSegments = parsePathname(from[0] === "/" ? from : "/" + from).map((s) => s.value);'
  fn += '\nconst l = baseSegments.length;'

  const max = parsedRoutes.reduce(
    (max, r) => Math.max(max, r.segments.length),
    0,
  )
  if (max > 0) fn += `\nconst [,${Array.from({ length: max }, (_, i) => `s${i + 1}`).join(', ')}] = baseSegments;`


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

  const all = prepareOptionalParams(
    prepareIndexRoutes(
      parsedRoutes
    ),
  )

  recursiveStaticMatch(all)

  it('generates a matching function', async () => {
    expect(await format(fn, { parser: 'typescript' })).toMatchInlineSnapshot(`
      "const baseSegments = parsePathname(from[0] === "/" ? from : "/" + from).map(
        (s) => s.value,
      );
      const l = baseSegments.length;
      const [, s1, s2, s3, s4, s5, s6, s7] = baseSegments;
      if (
        l === 7 &&
        s1 === "a" &&
        s2 === "b" &&
        s3 === "c" &&
        s4 === "d" &&
        s5 === "e" &&
        s6 === "f"
      )
        return "/a/b/c/d/e/f";
      if (l === 5) {
        if (s1 === "z" && s2 === "y" && s3 === "x") {
          if (s4 === "u") return "/z/y/x/u";
          if (s4 === "v") return "/z/y/x/v";
          if (s4 === "w") return "/z/y/x/w";
        }
      }
      if (l === 4) {
        if (s1 === "a" && s2 === "profile" && s3 === "settings")
          return "/a/profile/settings";
        if (s1 === "b" && s2 === "profile" && s3 === "settings")
          return "/b/profile/settings";
        if (s1 === "users" && s2 === "profile" && s3 === "settings")
          return "/users/profile/settings";
        if (s1 === "z" && s2 === "y" && s3 === "x") return "/z/y/x";
        if (s1 === "foo" && s2 === "bar") return "/foo/bar/$id";
      }
      if (l === 3) {
        if (s1 === "a" && s2 === "profile") return "/a/profile";
        if (s1 === "b" && s2 === "profile") return "/b/profile";
        if (s1 === "beep" && s2 === "boop") return "/beep/boop";
        if (s1 === "one" && s2 === "two") return "/one/two";
        if (s1 === "users" && s2 === "profile") return "/users/profile";
      }
      if (l === 4 && s1 === "foo" && s3 === "bar") return "/foo/$id/bar";
      if (l === 4 && s1 === "foo" && s3 === "qux") return "/foo/{-$bar}/qux";
      if (l === 3) {
        if (s1 === "foo" && s2 === "qux") return "/foo/{-$bar}/qux";
        if (s1 === "a" && s2.startsWith("user-")) return "/a/user-{$id}";
        if (s1 === "api" && s2.startsWith("user-")) return "/api/user-{$id}";
        if (s1 === "b" && s2.startsWith("user-")) return "/b/user-{$id}";
      }
      if (l === 4 && s1 === "foo" && s3 === "/") return "/foo/$bar/";
      if (l === 3) {
        if (s1 === "foo") return "/foo/$bar/";
        if (s1 === "a") return "/a/$id";
        if (s1 === "b") return "/b/$id";
        if (s1 === "foo") return "/foo/$bar";
        if (s1 === "users") return "/users/$id";
        if (s1 === "a") return "/a/{-$slug}";
      }
      if (l === 2 && s1 === "a") return "/a/{-$slug}";
      if (l === 3 && s1 === "b") return "/b/{-$slug}";
      if (l === 2 && s1 === "b") return "/b/{-$slug}";
      if (l === 3 && s1 === "posts") return "/posts/{-$slug}";
      if (l === 2 && s1 === "posts") return "/posts/{-$slug}";
      if (l >= 2) {
        if (
          s1 === "cache" &&
          s2.startsWith("temp_") &&
          baseSegments[l - 1].endsWith(".log")
        )
          return "/cache/temp_{$}.log";
        if (s1 === "images" && s2.startsWith("thumb_")) return "/images/thumb_{$}";
        if (s1 === "logs" && baseSegments[l - 1].endsWith(".txt"))
          return "/logs/{$}.txt";
        if (s1 === "a") return "/a/$";
        if (s1 === "b") return "/b/$";
        if (s1 === "files") return "/files/$";
      }
      if (l === 2) {
        if (s1 === "a") return "/a";
        if (s1 === "about") return "/about";
        if (s1 === "b") return "/b";
        if (s1 === "one") return "/one";
      }
      if (l === 1) return "/";
      if (l === 4 && s2 === "bar" && s3 === "foo") return "/$id/bar/foo";
      if (l === 4 && s2 === "foo" && s3 === "bar") return "/$id/foo/bar";
      "
    `)
  })

  const buildMatcher = new Function('parsePathname', 'from', fn) as (
    parser: typeof parsePathname,
    from: string,
  ) => string | undefined

  // WARN: some of these don't work yet, they're just here to show the differences
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
      `matching: ${s}, originalMatch: ${originalMatch}, buildMatch: ${buildMatch}`,
    )
    expect(buildMatch).toBe(originalMatch)
  })
})
