import { describe, expect, it, test } from 'vitest'
import {
  joinPaths,
  matchPathname,
  parsePathname,
  processRouteTree,
} from '../src'

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

  const parsedRoutes = result.flatRoutes.map((route) =>
    parsePathname(route.fullPath),
  )

  const logParsed = (parsed: ReturnType<typeof parsePathname>) =>
    '/' +
    parsed
      .slice(1)
      .map((s) => s.value)
      .join('/')

  const rebuildPath = (leaf: ReturnType<typeof parsePathname>) =>
    `/${leaf
      .slice(1)
      .map((s) =>
        s.value === '/'
          ? ''
          : `${s.prefixSegment ?? ''}${s.prefixSegment || s.suffixSegment ? '{' : ''}${s.value}${s.prefixSegment || s.suffixSegment ? '}' : ''}${s.suffixSegment ?? ''}`,
      )
      .join('/')}`

  const initialDepth = 0
  let fn = 'const baseSegments = parsePathname(from);'
  fn += '\nconst l = baseSegments.length;'

  function recursiveStaticMatch(
    parsedRoutes: Array<ReturnType<typeof parsePathname>>,
    depth = initialDepth,
    indent = '',
  ) {
    const resolved = new Set<ReturnType<typeof parsePathname>>()
    for (const routeSegments of parsedRoutes) {
      if (resolved.has(routeSegments)) continue // already resolved
      console.log('\n')
      console.log(
        'resolving: depth=',
        depth,
        'parsed=',
        logParsed(routeSegments),
      )
      console.log('\u001b[34m' + fn + '\u001b[0m')
      const currentSegment = routeSegments[depth]
      if (!currentSegment) {
        throw new Error('Implementation error: this should not happen, depth=' + depth + `, route=${rebuildPath(routeSegments)}`)
      }
      const candidates = parsedRoutes.filter((r) => {
        const rParsed = r[depth]
        if (!rParsed) return false

        // For SEGMENT_TYPE_PARAM (type 1), match only on type and prefix/suffix constraints
        if (currentSegment.type === 1) {
          return (
            rParsed.type === 1 &&
            rParsed.prefixSegment === currentSegment.prefixSegment &&
            rParsed.suffixSegment === currentSegment.suffixSegment
          )
        }

        // For SEGMENT_TYPE_WILDCARD (type 2), match only on type and prefix/suffix constraints
        if (currentSegment.type === 2) {
          return (
            rParsed.type === 2 &&
            rParsed.prefixSegment === currentSegment.prefixSegment &&
            rParsed.suffixSegment === currentSegment.suffixSegment
          )
        }

        // For all other segment types (SEGMENT_TYPE_PATHNAME, etc.), use exact matching
        return (
          rParsed.type === currentSegment.type &&
          rParsed.value === currentSegment.value &&
          rParsed.hasStaticAfter === currentSegment.hasStaticAfter &&
          rParsed.prefixSegment === currentSegment.prefixSegment &&
          rParsed.suffixSegment === currentSegment.suffixSegment
        )
      })
      console.log('candidates:', candidates.map(logParsed))
      if (candidates.length === 0) {
        throw new Error('Implementation error: this should not happen')
      }
      if (candidates.length > 1) {
        let skipDepth = routeSegments.slice(depth + 1).findIndex((s, i) =>
          candidates.some((c) => {
            const segment = c[depth + 1 + i]
            return (
              !segment ||
              segment.type !== s.type ||
              segment.value !== s.value ||
              segment.hasStaticAfter !== s.hasStaticAfter ||
              segment.prefixSegment !== s.prefixSegment ||
              segment.suffixSegment !== s.suffixSegment
            )
          }),
        )
        if (skipDepth === -1) skipDepth = routeSegments.length - depth - 1
        const lCondition =
          skipDepth || depth > initialDepth ? `l > ${depth + skipDepth}` : ''
        const skipConditions =
          Array.from({ length: skipDepth + 1 }, (_, i) => {
            const segment = candidates[0]![depth + i]!
            if (segment.type === 1) {
              const conditions = []
              if (segment.prefixSegment) {
                conditions.push(
                  `baseSegments[${depth + i}].value.startsWith('${segment.prefixSegment}')`,
                )
              }
              if (segment.suffixSegment) {
                conditions.push(
                  `baseSegments[${depth + i}].value.endsWith('${segment.suffixSegment}')`,
                )
              }
              return conditions.join(' && ')
            }
            if (segment.type === 2) {
              // Wildcards consume all remaining segments, no checking needed
              return ''
            }
            return `baseSegments[${depth + i}].value === '${segment.value}'`
          })
            .filter(Boolean)
            .join(`\n${indent}  && `) + (skipDepth ? `\n${indent}` : '')
        const hasCondition = Boolean(lCondition || skipConditions)
        if (hasCondition) {
          fn += `\n${indent}if (${lCondition}${lCondition && skipConditions ? ' && ' : ''}${skipConditions}) {`
        }
        const deeper = candidates.filter(
          (c) => c.length > depth + 1 + skipDepth,
        )
        const leaves = candidates.filter(
          (c) => c.length <= depth + 1 + skipDepth,
        )
        if (deeper.length + leaves.length !== candidates.length) {
          throw new Error('Implementation error: this should not happen')
        }
        if (deeper.length > 0) {
          recursiveStaticMatch(
            deeper,
            depth + 1 + skipDepth,
            hasCondition ? indent + '  ' : indent,
          )
        }
        if (leaves.length > 1) {
          // WARN: we should probably support "multiple leaves"
          // 1. user error: it's possible that a user created both `/a/$id` and `/a/$foo`, they'd be both matched, just use the 1st one
          // 2. wildcards: if a user created both `/a/$` and `/a/b`, we could have 2 leaves. the order in `leaves` will be `[/a/b, /a/$]` which is correct, try to match `/a/b` first, then `/a/$`
          throw new Error(
            `Multiple candidates found for depth ${depth} with type ${routeSegments[depth]!.type} and value ${routeSegments[depth]!.value}: ${leaves.map(logParsed).join(', ')}`,
          )
        } else if (leaves.length === 1) {
          // WARN: is it ok that the leaf is matched last?
          fn += `\n${indent}  if (l === ${leaves[0]!.length}) {`
          fn += `\n${indent}    return '${rebuildPath(leaves[0]!)}';`
          fn += `\n${indent}  }`
        }
        if (hasCondition) {
          fn += `\n${indent}}`
        }
      } else {
        const leaf = candidates[0]!

        // Check if this route contains a wildcard segment
        const wildcardIndex = leaf.findIndex((s) => s && s.type === 2)

        if (wildcardIndex !== -1 && wildcardIndex >= depth) {
          // This route has a wildcard at or after the current depth
          const wildcardSegment = leaf[wildcardIndex]!
          const done = `return '${rebuildPath(leaf)}';`

          // For wildcards, we need to check:
          // 1. All static/param segments before the wildcard match
          // 2. There are remaining segments for the wildcard to consume (l >= wildcardIndex)
          // 3. Handle prefix/suffix constraints for the wildcard if present

          const conditions = [`l >= ${wildcardIndex}`]

          // Add conditions for all segments before the wildcard
          for (let i = depth; i < wildcardIndex; i++) {
            const segment = leaf[i]!
            const value = `baseSegments[${i}].value`

            if (segment.type === 1) {
              // Parameter segment
              if (segment.prefixSegment) {
                conditions.push(
                  `${value}.startsWith('${segment.prefixSegment}')`,
                )
              }
              if (segment.suffixSegment) {
                conditions.push(`${value}.endsWith('${segment.suffixSegment}')`)
              }
            } else if (segment.type === 0) {
              // Static segment
              conditions.push(`${value} === '${segment.value}'`)
            }
          }

          // Handle prefix/suffix for the wildcard itself
          if (wildcardSegment.prefixSegment || wildcardSegment.suffixSegment) {
            const wildcardValue = `baseSegments[${wildcardIndex}].value`
            if (wildcardSegment.prefixSegment) {
              conditions.push(
                `${wildcardValue}.startsWith('${wildcardSegment.prefixSegment}')`,
              )
            }
            if (wildcardSegment.suffixSegment) {
              // For suffix wildcard, we need to check the last segment
              conditions.push(
                `baseSegments[l - 1].value.endsWith('${wildcardSegment.suffixSegment}')`,
              )
            }
          }

          fn += `\n${indent}if (${conditions.join(' && ')}) {`
          fn += `\n${indent}  ${done}`
          fn += `\n${indent}}`
        } else {
          // No wildcard in this route, use the original logic
          const done = `return '${rebuildPath(leaf)}';`
          fn += `\n${indent}if (l === ${leaf.length}`
          for (let i = depth; i < leaf.length; i++) {
            const segment = leaf[i]!
            const value = `baseSegments[${i}].value`

            // For SEGMENT_TYPE_PARAM (type 1), check if base has static segment (type 0) that satisfies constraints
            if (segment.type === 1) {
              if (segment.prefixSegment || segment.suffixSegment) {
                fn += `\n${indent}  `
              }
              // Add prefix/suffix checks for parameters with prefix/suffix
              if (segment.prefixSegment) {
                fn += ` && ${value}.startsWith('${segment.prefixSegment}')`
              }
              if (segment.suffixSegment) {
                fn += ` && ${value}.endsWith('${segment.suffixSegment}')`
              }
            } else {
              // For other segment types, use exact matching
              fn += `\n${indent}  && ${value} === '${segment.value}'`
            }
          }
          fn += `\n${indent}) {`
          fn += `\n${indent}  ${done}`
          fn += `\n${indent}}`
        }
      }
      candidates.forEach((c) => resolved.add(c))
    }
  }

  recursiveStaticMatch(parsedRoutes)

  it('generates a matching function', () => {
    expect(fn).toMatchInlineSnapshot(`
      "const baseSegments = parsePathname(from);
      const l = baseSegments.length;
      if (baseSegments[0].value === '/') {
        if (l > 1 && baseSegments[1].value === 'a') {
          if (l === 7
            && baseSegments[2].value === 'b'
            && baseSegments[3].value === 'c'
            && baseSegments[4].value === 'd'
            && baseSegments[5].value === 'e'
            && baseSegments[6].value === 'f'
          ) {
            return '/a/b/c/d/e/f';
          }
          if (l > 2 && baseSegments[2].value === 'profile') {
            if (l === 4
              && baseSegments[3].value === 'settings'
            ) {
              return '/a/profile/settings';
            }
            if (l === 3) {
              return '/a/profile';
            }
          }
          if (l === 3
             && baseSegments[2].value.startsWith('user-')
          ) {
            return '/a/user-{$id}';
          }
          if (l === 3
          ) {
            return '/a/$id';
          }
          if (l === 3
            && baseSegments[2].value === '$slug'
          ) {
            return '/a/$slug';
          }
          if (l >= 2) {
            return '/a/$';
          }
          if (l === 2) {
            return '/a';
          }
        }
        if (l > 3 && baseSegments[1].value === 'z'
          && baseSegments[2].value === 'y'
          && baseSegments[3].value === 'x'
        ) {
          if (l === 5
            && baseSegments[4].value === 'u'
          ) {
            return '/z/y/x/u';
          }
          if (l === 5
            && baseSegments[4].value === 'v'
          ) {
            return '/z/y/x/v';
          }
          if (l === 5
            && baseSegments[4].value === 'w'
          ) {
            return '/z/y/x/w';
          }
          if (l === 4) {
            return '/z/y/x';
          }
        }
        if (l > 1 && baseSegments[1].value === 'b') {
          if (l > 2 && baseSegments[2].value === 'profile') {
            if (l === 4
              && baseSegments[3].value === 'settings'
            ) {
              return '/b/profile/settings';
            }
            if (l === 3) {
              return '/b/profile';
            }
          }
          if (l === 3
             && baseSegments[2].value.startsWith('user-')
          ) {
            return '/b/user-{$id}';
          }
          if (l === 3
          ) {
            return '/b/$id';
          }
          if (l === 3
            && baseSegments[2].value === '$slug'
          ) {
            return '/b/$slug';
          }
          if (l >= 2) {
            return '/b/$';
          }
          if (l === 2) {
            return '/b';
          }
        }
        if (l > 1 && baseSegments[1].value === 'users') {
          if (l > 2 && baseSegments[2].value === 'profile') {
            if (l === 4
              && baseSegments[3].value === 'settings'
            ) {
              return '/users/profile/settings';
            }
            if (l === 3) {
              return '/users/profile';
            }
          }
          if (l === 3
          ) {
            return '/users/$id';
          }
        }
        if (l > 1 && baseSegments[1].value === 'foo') {
          if (l === 4
            && baseSegments[2].value === 'bar'
          ) {
            return '/foo/bar/$id';
          }
          if (l > 2) {
            if (l === 4
              && baseSegments[3].value === 'bar'
            ) {
              return '/foo/$id/bar';
            }
            if (l === 3) {
              return '/foo/$bar';
            }
          }
          if (l === 4
            && baseSegments[2].value === '$bar'
            && baseSegments[3].value === 'qux'
          ) {
            return '/foo/$bar/qux';
          }
        }
        if (l === 3
          && baseSegments[1].value === 'beep'
          && baseSegments[2].value === 'boop'
        ) {
          return '/beep/boop';
        }
        if (l > 1 && baseSegments[1].value === 'one') {
          if (l === 3
            && baseSegments[2].value === 'two'
          ) {
            return '/one/two';
          }
          if (l === 2) {
            return '/one';
          }
        }
        if (l === 3
          && baseSegments[1].value === 'api'
           && baseSegments[2].value.startsWith('user-')
        ) {
          return '/api/user-{$id}';
        }
        if (l === 3
          && baseSegments[1].value === 'posts'
          && baseSegments[2].value === '$slug'
        ) {
          return '/posts/$slug';
        }
        if (l >= 2 && baseSegments[1].value === 'cache' && baseSegments[2].value.startsWith('temp_') && baseSegments[l - 1].value.endsWith('.log')) {
          return '/cache/temp_{$}.log';
        }
        if (l >= 2 && baseSegments[1].value === 'images' && baseSegments[2].value.startsWith('thumb_')) {
          return '/images/thumb_{$}';
        }
        if (l >= 2 && baseSegments[1].value === 'logs' && baseSegments[l - 1].value.endsWith('.txt')) {
          return '/logs/{$}.txt';
        }
        if (l >= 2 && baseSegments[1].value === 'files') {
          return '/files/$';
        }
        if (l === 2
          && baseSegments[1].value === 'about'
        ) {
          return '/about';
        }
        if (l > 1) {
          if (l === 4
            && baseSegments[2].value === 'bar'
            && baseSegments[3].value === 'foo'
          ) {
            return '/$id/bar/foo';
          }
          if (l === 4
            && baseSegments[2].value === 'foo'
            && baseSegments[3].value === 'bar'
          ) {
            return '/$id/foo/bar';
          }
        }
        if (l === 1) {
          return '/';
        }
      }"
    `)
  })

  const buildMatcher = new Function('parsePathname', 'from', fn) as (
    parser: typeof parsePathname,
    from: string,
  ) => string | undefined

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
  ])('matching %s', (s) => {
    const originalMatch = originalMatcher(s)
    const buildMatch = buildMatcher(parsePathname, s)
    console.log(
      `matching: ${s}, originalMatch: ${originalMatch}, buildMatch: ${buildMatch}`,
    )
    expect(buildMatch).toBe(originalMatch)
  })
})
