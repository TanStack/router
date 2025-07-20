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
} from '../src/path'
import { format } from 'prettier'

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

  const parsedRoutes = result.flatRoutes.map(
    (route): ParsedRoute => ({
      path: route.fullPath,
      segments: parsePathname(route.fullPath),
      rank: route.rank!,
    }),
  )

  type ParsedRoute = {
    path: string
    segments: ReturnType<typeof parsePathname>
    rank: number
  }

  let fn = 'const baseSegments = parsePathname(from).map(s => s.value);'
  fn += '\nconst l = baseSegments.length;'

  type WithConditions = ParsedRoute & {
    conditions: Array<Condition>
    length: { min: number; max: number }
  }

  function conditionToString(condition: Condition) {
    if (condition.kind === 'static') {
      if (condition.index === 0 && condition.value === '/') return undefined // root segment is always `/`
      return `s${condition.index} === '${condition.value}'`
    } else if (condition.kind === 'startsWith') {
      return `s${condition.index}.startsWith('${condition.value}')`
    } else if (condition.kind === 'endsWith') {
      return `s${condition.index}.endsWith('${condition.value}')`
    } else if (condition.kind === 'wildcardEndsWith') {
      return `baseSegments[l - 1].endsWith('${condition.value}')`
    }
    return undefined
  }

  function outputRoute(
    route: WithConditions,
    length: { min: number; max: number },
    preconditions: Array<string> = [],
  ) {
    const flags: Array<string> = []
    let min = length.min
    if (route.length.min > length.min) min = route.length.min
    let max = length.max
    if (route.length.max < length.max) max = route.length.max
    for (const condition of route.conditions) {
      if (condition.kind === 'static' && condition.index + 1 < min) {
        min = condition.index + 1
      } else if (condition.kind === 'startsWith' && condition.index + 1 < min) {
        min = condition.index + 1
      } else if (condition.kind === 'endsWith' && condition.index + 1 < min) {
        min = condition.index + 1
      }
    }

    if (min > length.min && max < length.max && min === max) {
      flags.push(`l === ${min}`)
    } else {
      if (min > length.min) {
        flags.push(`l >= ${min}`)
      }
      if (max < length.max) {
        flags.push(`l <= ${max}`)
      }
    }
    for (const condition of route.conditions) {
      if (!preconditions.includes(condition.key)) {
        const str = conditionToString(condition)
        if (str) {
          flags.push(str)
        }
      }
    }
    if (flags.length) {
      fn += `if (${flags.join(' && ')}) {`
    }
    fn += `propose(${route.rank}, '${route.path}');`
    if (flags.length) {
      fn += '}'
    }
  }

  function recursiveStaticMatch(
    parsedRoutes: Array<WithConditions>,
    length: { min: number; max: number } = { min: 0, max: Infinity },
    preconditions: Array<string> = [],
  ) {
    // count all conditions by `key`
    // determine the condition that would match as close to 50% of the routes as possible
    const conditionCounts: Record<string, number> = {}
    parsedRoutes.forEach((r) => {
      r.conditions.forEach((c) => {
        conditionCounts[c.key] = (conditionCounts[c.key] || 0) + 1
      })
    })
    const total = parsedRoutes.length
    const target = total / 2
    let bestKey
    let bestScore = Infinity
    for (const key in conditionCounts) {
      if (preconditions.includes(key)) continue
      const score = Math.abs(conditionCounts[key]! - target)
      if (score < bestScore) {
        bestScore = score
        bestKey = key
      }
    }
    // console.log(`Best condition key: ${bestKey} with score: ${conditionCounts[bestKey]} / ${total}`)

    // look at all minLengths and maxLengths
    // determine a minLength and a maxLength that would match as close to 50% of the routes as possible
    const minLengths: Record<number, number> = {}
    const maxLengths: Record<number, number> = {}
    parsedRoutes.forEach((r) => {
      const minLength = r.length.min
      if (minLength > length.min) {
        minLengths[minLength] = (minLengths[minLength] || 0) + 1
      }
      const maxLength = r.length.max
      if (maxLength !== Infinity && maxLength < length.max) {
        maxLengths[maxLength] = (maxLengths[maxLength] || 0) + 1
      }
    })
    const allMinLengths = Object.keys(minLengths).sort(
      (a, b) => Number(a) - Number(b),
    )
    for (let i = 0; i < allMinLengths.length; i++) {
      for (let j = i + 1; j < allMinLengths.length; j++) {
        minLengths[Number(allMinLengths[i]!)]! +=
          minLengths[Number(allMinLengths[j]!)]!
      }
    }
    const allMaxLengths = Object.keys(maxLengths).sort(
      (a, b) => Number(b) - Number(a),
    )
    for (let i = 0; i < allMaxLengths.length; i++) {
      for (let j = i + 1; j < allMaxLengths.length; j++) {
        maxLengths[Number(allMaxLengths[i]!)]! +=
          maxLengths[Number(allMaxLengths[j]!)]!
      }
    }
    let bestMinLength
    let bestMaxLength
    let bestMinScore = Infinity
    for (const minLength in minLengths) {
      const minScore = Math.abs(minLengths[minLength]! - target)
      if (minScore < bestMinScore) {
        bestMinScore = minScore
        bestMinLength = Number(minLength)
      }
    }
    for (const maxLength in maxLengths) {
      const maxScore = Math.abs(maxLengths[maxLength]! - target)
      if (maxScore < bestMinScore) {
        bestMinScore = maxScore
        bestMaxLength = Number(maxLength)
      }
    }
    // console.log(`Best minLength: ${bestMinLength} with score: ${minLengths[bestMinLength!]} / ${total}`)
    // console.log(`Best maxLength: ${bestMaxLength} with score: ${maxLengths[bestMaxLength!]} / ${total}`)

    // determine which of the 3 discriminants to use (condition, minLength, maxLength) to match as close to 50% of the routes as possible
    const discriminant =
      bestKey &&
      (!bestMinLength ||
        conditionCounts[bestKey] > minLengths[bestMinLength!]) &&
      (!bestMaxLength || conditionCounts[bestKey] > maxLengths[bestMaxLength!])
        ? ({ key: bestKey, type: 'condition' } as const)
        : bestMinLength &&
            (!bestMaxLength ||
              minLengths[bestMinLength!] > maxLengths[bestMaxLength!]) &&
            (!bestKey || minLengths[bestMinLength!] > conditionCounts[bestKey])
          ? ({ key: bestMinLength!, type: 'minLength' } as const)
          : bestMaxLength
            ? ({ key: bestMaxLength!, type: 'maxLength' } as const)
            : undefined

    if (discriminant) {
      // split all routes into 2 groups (matching and not matching) based on the discriminant
      const matchingRoutes: Array<WithConditions> = []
      const nonMatchingRoutes: Array<WithConditions> = []
      for (const route of parsedRoutes) {
        if (discriminant.type === 'condition') {
          const condition = route.conditions.find(
            (c) => c.key === discriminant.key,
          )
          if (condition) {
            matchingRoutes.push(route)
          } else {
            nonMatchingRoutes.push(route)
          }
        } else if (discriminant.type === 'minLength') {
          if (route.length.min >= discriminant.key) {
            matchingRoutes.push(route)
          } else {
            nonMatchingRoutes.push(route)
          }
        } else if (discriminant.type === 'maxLength') {
          if (route.length.max <= discriminant.key) {
            matchingRoutes.push(route)
          } else {
            nonMatchingRoutes.push(route)
          }
        }
      }
      if (matchingRoutes.length === 1) {
        outputRoute(matchingRoutes[0]!, length, preconditions)
      } else if (matchingRoutes.length) {
        // add `if` for the discriminant
        const nextLength = {
          min:
            discriminant.type === 'minLength' ? discriminant.key : length.min,
          max:
            discriminant.type === 'maxLength' ? discriminant.key : length.max,
        }
        if (discriminant.type === 'condition') {
          const condition = matchingRoutes[0]!.conditions.find(
            (c) => c.key === discriminant.key,
          )!
          fn += `if (${conditionToString(condition) || 'true'}) {`
        } else if (discriminant.type === 'minLength') {
          if (discriminant.key === length.max) {
            fn += `if (l === ${discriminant.key}) {`
          } else {
            if (
              matchingRoutes.every((r) => r.length.max === discriminant.key)
            ) {
              nextLength.max = discriminant.key
              fn += `if (l === ${discriminant.key}) {`
            } else {
              fn += `if (l >= ${discriminant.key}) {`
            }
          }
        } else if (discriminant.type === 'maxLength') {
          if (discriminant.key === length.min) {
            fn += `if (l === ${discriminant.key}) {`
          } else {
            if (
              matchingRoutes.every((r) => r.length.min === discriminant.key)
            ) {
              nextLength.min = discriminant.key
              fn += `if (l === ${discriminant.key}) {`
            } else {
              fn += `if (l <= ${discriminant.key}) {`
            }
          }
        } else {
          throw new Error(
            `Unknown discriminant type: ${JSON.stringify(discriminant)}`,
          )
        }
        // recurse
        recursiveStaticMatch(
          matchingRoutes,
          nextLength,
          discriminant.type === 'condition'
            ? [...preconditions, discriminant.key]
            : preconditions,
        )
        fn += '}'
      }
      if (nonMatchingRoutes.length === 1) {
        outputRoute(nonMatchingRoutes[0]!, length, preconditions)
      } else if (nonMatchingRoutes.length) {
        // recurse
        recursiveStaticMatch(nonMatchingRoutes, length, preconditions)
      }
    } else {
      const [route, ...rest] = parsedRoutes
      if (route) outputRoute(route, length, preconditions)
      if (rest.length) {
        // try again w/ 1 fewer route, it might find a good discriminant now
        recursiveStaticMatch(rest, length, preconditions)
      }
    }
  }

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
      const withoutOptional: ParsedRoute = {
        ...route,
        segments: route.segments.filter((_, i) => i !== index),
      }
      const withRegular: ParsedRoute = {
        ...route,
        segments: route.segments.map((s, i) =>
          i === index ? { ...s, type: SEGMENT_TYPE_PARAM } : s,
        ),
      }
      const chunk = prepareOptionalParams([withRegular, withoutOptional])
      result.push(...chunk)
    }
    return result
  }

  type Condition =
    | { key: string; kind: 'static'; index: number; value: string }
    | { key: string; kind: 'startsWith'; index: number; value: string }
    | { key: string; kind: 'endsWith'; index: number; value: string }
    | { key: string; kind: 'wildcardEndsWith'; value: string }

  const withConditions: Array<WithConditions> = prepareOptionalParams(
    parsedRoutes,
  ).map((r) => {
    let minLength = 0
    let maxLength = 0
    const conditions: Array<Condition> = r.segments.flatMap((s, i) => {
      if (s.type === SEGMENT_TYPE_PATHNAME) {
        minLength += 1
        maxLength += 1
        if (i === 0 && s.value === '/') {
          return []
        }
        return [
          {
            kind: 'static',
            index: i,
            value: s.value,
            key: `static-${i}-${s.value}`,
          },
        ]
      } else if (s.type === SEGMENT_TYPE_PARAM) {
        minLength += 1
        maxLength += 1
        const conds: Array<Condition> = []
        if (s.prefixSegment) {
          conds.push({
            kind: 'startsWith',
            index: i,
            value: s.prefixSegment,
            key: `startsWith-${i}-${s.prefixSegment}`,
          })
        }
        if (s.suffixSegment) {
          conds.push({
            kind: 'endsWith',
            index: i,
            value: s.suffixSegment,
            key: `endsWith-${i}-${s.suffixSegment}`,
          })
        }
        return conds
      } else if (s.type === SEGMENT_TYPE_WILDCARD) {
        maxLength += Infinity
        const conds: Array<Condition> = []
        if (s.prefixSegment || s.suffixSegment) {
          minLength += 1
        }
        if (s.prefixSegment) {
          conds.push({
            kind: 'startsWith',
            index: i,
            value: s.prefixSegment,
            key: `startsWith-${i}-${s.prefixSegment}`,
          })
        }
        if (s.suffixSegment) {
          conds.push({
            kind: 'wildcardEndsWith',
            value: s.suffixSegment,
            key: `wildcardEndsWith-${s.suffixSegment}`,
          })
        }
        return conds
      }
      return []
    })
    return { ...r, conditions, length: { min: minLength, max: maxLength } }
  })

  const max = withConditions.reduce(
    (max, r) =>
      Math.max(
        max,
        r.conditions.reduce((max, c) => {
          if (
            c.kind === 'static' ||
            c.kind === 'startsWith' ||
            c.kind === 'endsWith'
          ) {
            return Math.max(max, c.index)
          }
          return max
        }, 0),
      ),
    0,
  )

  if (max > 0)
    fn += `const [${Array.from({ length: max + 1 }, (_, i) => `s${i}`).join(', ')}] = baseSegments;\n`

  recursiveStaticMatch(withConditions)

  it('generates a matching function', async () => {
    expect(await format(fn, { parser: 'typescript' })).toMatchInlineSnapshot(`
      "const baseSegments = parsePathname(from).map((s) => s.value);
      const l = baseSegments.length;
      const [s0, s1, s2, s3, s4, s5, s6] = baseSegments;
      if (l <= 3) {
        if (l === 3) {
          if (s1 === "a") {
            if (s2 === "profile") {
              propose(9, "/a/profile");
            }
            if (s2.startsWith("user-")) {
              propose(16, "/a/user-{$id}");
            }
            propose(19, "/a/$id");
            propose(23, "/a/{-$slug}");
          }
          if (s1 === "b") {
            if (s2 === "profile") {
              propose(10, "/b/profile");
            }
            if (s2.startsWith("user-")) {
              propose(18, "/b/user-{$id}");
            }
            propose(20, "/b/$id");
            propose(24, "/b/{-$slug}");
          }
          if (s1 === "users") {
            if (s2 === "profile") {
              propose(13, "/users/profile");
            }
            propose(22, "/users/$id");
          }
          if (s1 === "foo") {
            if (s2 === "qux") {
              propose(15, "/foo/{-$bar}/qux");
            }
            propose(21, "/foo/$bar");
          }
          if (s1 === "beep" && s2 === "boop") {
            propose(11, "/beep/boop");
          }
          if (s1 === "one" && s2 === "two") {
            propose(12, "/one/two");
          }
          if (s1 === "api" && s2.startsWith("user-")) {
            propose(17, "/api/user-{$id}");
          }
          if (s1 === "posts") {
            propose(25, "/posts/{-$slug}");
          }
        }
        if (l === 2) {
          if (s1 === "a") {
            propose(23, "/a/{-$slug}");
            propose(32, "/a");
          }
          if (s1 === "b") {
            propose(24, "/b/{-$slug}");
            propose(34, "/b");
          }
          if (s1 === "posts") {
            propose(25, "/posts/{-$slug}");
          }
          if (s1 === "about") {
            propose(33, "/about");
          }
          if (s1 === "one") {
            propose(35, "/one");
          }
        }
        if (l === 1) {
          propose(36, "/");
        }
      }
      if (l >= 4) {
        if (
          l <= 7 &&
          s1 === "a" &&
          s2 === "b" &&
          s3 === "c" &&
          s4 === "d" &&
          s5 === "e" &&
          s6 === "f"
        ) {
          propose(0, "/a/b/c/d/e/f");
        }
        if (s1 === "z") {
          if (l === 5) {
            if (s2 === "y" && s3 === "x" && s4 === "u") {
              propose(1, "/z/y/x/u");
            }
            if (s2 === "y" && s3 === "x" && s4 === "v") {
              propose(2, "/z/y/x/v");
            }
            if (s2 === "y" && s3 === "x" && s4 === "w") {
              propose(3, "/z/y/x/w");
            }
          }
          if (l <= 4 && s2 === "y" && s3 === "x") {
            propose(7, "/z/y/x");
          }
        }
        if (l === 4) {
          if (s2 === "profile") {
            if (s1 === "a" && s3 === "settings") {
              propose(4, "/a/profile/settings");
            }
            if (s1 === "b" && s3 === "settings") {
              propose(5, "/b/profile/settings");
            }
            if (s1 === "users" && s3 === "settings") {
              propose(6, "/users/profile/settings");
            }
          }
          if (s1 === "foo") {
            if (s2 === "bar") {
              propose(8, "/foo/bar/$id");
            }
            if (s3 === "bar") {
              propose(14, "/foo/$id/bar");
            }
            if (s3 === "qux") {
              propose(15, "/foo/{-$bar}/qux");
            }
          }
          if (s2 === "bar" && s3 === "foo") {
            propose(37, "/$id/bar/foo");
          }
          if (s2 === "foo" && s3 === "bar") {
            propose(38, "/$id/foo/bar");
          }
        }
      }
      if (l >= 3) {
        if (
          s1 === "cache" &&
          s2.startsWith("temp_") &&
          baseSegments[l - 1].endsWith(".log")
        ) {
          propose(26, "/cache/temp_{$}.log");
        }
        if (s1 === "images" && s2.startsWith("thumb_")) {
          propose(27, "/images/thumb_{$}");
        }
        if (s1 === "logs" && baseSegments[l - 1].endsWith(".txt")) {
          propose(28, "/logs/{$}.txt");
        }
      }
      if (l >= 2) {
        if (s1 === "a") {
          propose(29, "/a/$");
        }
        if (s1 === "b") {
          propose(30, "/b/$");
        }
        if (s1 === "files") {
          propose(31, "/files/$");
        }
      }
      "
    `)
  })

  const buildMatcher = new Function('parsePathname', 'propose', 'from', fn) as (
    parser: typeof parsePathname,
    propose: (rank: number, path: string) => void,
    from: string,
  ) => string | undefined

  const wrappedMatcher = (from: string): string | undefined => {
    let bestRank = Infinity
    let bestPath: string | undefined = undefined
    const propose = (rank: number, path: string) => {
      if (rank < bestRank) {
        bestRank = rank
        bestPath = path
      }
    }
    buildMatcher(parsePathname, propose, from)
    return bestPath
  }

  // WARN: some of these don't work yet, they're just here to show the differences
  test.each([
    '/',
    '/users/profile/settings',
    '/foo/123',
    '/b/123',
    '/foo/qux',
    '/foo/123/qux',
    '/foo/qux',
    '/a/user-123',
    '/a/123',
    '/a/123/more',
    '/files',
    '/files/hello-world.txt',
    '/something/foo/bar',
    '/files/deep/nested/file.json',
    '/files/',
    '/images/thumb_200x300.jpg',
    '/logs/error.txt',
    '/cache/temp_user456.log',
    '/a/b/c/d/e',
  ])('matching %s', (s) => {
    const originalMatch = originalMatcher(s)
    const buildMatch = wrappedMatcher(s)
    console.log(
      `matching: ${s}, originalMatch: ${originalMatch}, buildMatch: ${buildMatch}`,
    )
    expect(buildMatch).toBe(originalMatch)
  })
})
