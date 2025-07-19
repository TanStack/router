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
        "/users/$id",
        "/a/{-$slug}",
        "/b/{-$slug}",
        "/posts/{-$slug}",
        "/a/$",
        "/b/$",
        "/files/$",
        "/a",
        "/about",
        "/b",
        "/one",
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

  const initialDepth = 1
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
      console.log('resolving: depth=', depth, 'parsed=', logParsed(routeSegments))
      console.log('\u001b[34m' + fn + '\u001b[0m')
      const currentSegment = routeSegments[depth]
      if (!currentSegment) {
        throw new Error('Implementation error: this should not happen')
      }
      const candidates = parsedRoutes.filter((r) => {
        const rParsed = r[depth]
        if (!rParsed) return false
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
          skipDepth || depth > initialDepth
            ? `l > ${depth + skipDepth} && `
            : ''
        const skipConditions =
          Array.from(
            { length: skipDepth + 1 },
            (_, i) =>
              `baseSegments[${depth + i}].type === ${candidates[0]![depth + i]!.type} && baseSegments[${depth + i}].value === '${candidates[0]![depth + i]!.value}'`,
          ).join(`\n${indent}  && `) +
          (skipDepth ? `\n${indent}` : '')
        fn += `\n${indent}if (${lCondition}${skipConditions}) {`
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
          recursiveStaticMatch(deeper, depth + 1 + skipDepth, indent + '  ')
        }
        if (leaves.length > 1) {
          throw new Error(
            `Multiple candidates found for depth ${depth} with type ${routeSegments[depth]!.type} and value ${routeSegments[depth]!.value}: ${leaves.map(logParsed).join(', ')}`,
          )
        } else if (leaves.length === 1) {
          // WARN: is it ok that the leaf is matched last?
          fn += `\n${indent}  if (l === ${leaves[0]!.length}) {`
          fn += `\n${indent}    return '/${leaves[0]!
            .slice(1)
            .map((s) => (s.value === '/' ? '' : s.value))
            .join('/')}';`
          fn += `\n${indent}  }`
        }
      } else {
        const leaf = candidates[0]!
        const done = `return '/${leaf
          .slice(1)
          .map((s) => (s.value === '/' ? '' : s.value))
          .join('/')}';`
        fn += `\n${indent}if (l === ${leaf.length}`
        for (let i = depth; i < leaf.length; i++) {
          const segment = leaf[i]!
          const type = `baseSegments[${i}].type`
          const value = `baseSegments[${i}].value`
          fn += `\n${indent}  && ${type} === ${segment.type} && ${value} === '${segment.value}'`
        }
        fn += `\n${indent}) {`
        fn += `\n${indent}  ${done}`
      }
      fn += `\n${indent}}`
      candidates.forEach((c) => resolved.add(c))
    }
  }

  recursiveStaticMatch(parsedRoutes)

  it('generates a matching function', () => {
    expect(fn).toMatchInlineSnapshot(`
      "const baseSegments = parsePathname(from);
      const l = baseSegments.length;
      if (baseSegments[1].type === 0 && baseSegments[1].value === 'a') {
        if (l === 7
          && baseSegments[2].type === 0 && baseSegments[2].value === 'b'
          && baseSegments[3].type === 0 && baseSegments[3].value === 'c'
          && baseSegments[4].type === 0 && baseSegments[4].value === 'd'
          && baseSegments[5].type === 0 && baseSegments[5].value === 'e'
          && baseSegments[6].type === 0 && baseSegments[6].value === 'f'
        ) {
          return '/a/b/c/d/e/f';
        }
        if (l > 2 && baseSegments[2].type === 0 && baseSegments[2].value === 'profile') {
          if (l === 4
            && baseSegments[3].type === 0 && baseSegments[3].value === 'settings'
          ) {
            return '/a/profile/settings';
          }
          if (l === 3) {
            return '/a/profile';
          }
        }
        if (l === 3
          && baseSegments[2].type === 1 && baseSegments[2].value === '$id'
        ) {
          return '/a/$id';
        }
        if (l === 3
          && baseSegments[2].type === 1 && baseSegments[2].value === '$id'
        ) {
          return '/a/$id';
        }
        if (l === 3
          && baseSegments[2].type === 3 && baseSegments[2].value === '$slug'
        ) {
          return '/a/$slug';
        }
        if (l === 3
          && baseSegments[2].type === 2 && baseSegments[2].value === '$'
        ) {
          return '/a/$';
        }
        if (l === 2) {
          return '/a';
        }
      }
      if (l > 3 && baseSegments[1].type === 0 && baseSegments[1].value === 'z'
        && baseSegments[2].type === 0 && baseSegments[2].value === 'y'
        && baseSegments[3].type === 0 && baseSegments[3].value === 'x'
      ) {
        if (l === 5
          && baseSegments[4].type === 0 && baseSegments[4].value === 'u'
        ) {
          return '/z/y/x/u';
        }
        if (l === 5
          && baseSegments[4].type === 0 && baseSegments[4].value === 'v'
        ) {
          return '/z/y/x/v';
        }
        if (l === 5
          && baseSegments[4].type === 0 && baseSegments[4].value === 'w'
        ) {
          return '/z/y/x/w';
        }
        if (l === 4) {
          return '/z/y/x';
        }
      }
      if (baseSegments[1].type === 0 && baseSegments[1].value === 'b') {
        if (l > 2 && baseSegments[2].type === 0 && baseSegments[2].value === 'profile') {
          if (l === 4
            && baseSegments[3].type === 0 && baseSegments[3].value === 'settings'
          ) {
            return '/b/profile/settings';
          }
          if (l === 3) {
            return '/b/profile';
          }
        }
        if (l === 3
          && baseSegments[2].type === 1 && baseSegments[2].value === '$id'
        ) {
          return '/b/$id';
        }
        if (l === 3
          && baseSegments[2].type === 1 && baseSegments[2].value === '$id'
        ) {
          return '/b/$id';
        }
        if (l === 3
          && baseSegments[2].type === 3 && baseSegments[2].value === '$slug'
        ) {
          return '/b/$slug';
        }
        if (l === 3
          && baseSegments[2].type === 2 && baseSegments[2].value === '$'
        ) {
          return '/b/$';
        }
        if (l === 2) {
          return '/b';
        }
      }
      if (baseSegments[1].type === 0 && baseSegments[1].value === 'users') {
        if (l > 2 && baseSegments[2].type === 0 && baseSegments[2].value === 'profile') {
          if (l === 4
            && baseSegments[3].type === 0 && baseSegments[3].value === 'settings'
          ) {
            return '/users/profile/settings';
          }
          if (l === 3) {
            return '/users/profile';
          }
        }
        if (l === 3
          && baseSegments[2].type === 1 && baseSegments[2].value === '$id'
        ) {
          return '/users/$id';
        }
      }
      if (baseSegments[1].type === 0 && baseSegments[1].value === 'foo') {
        if (l === 4
          && baseSegments[2].type === 0 && baseSegments[2].value === 'bar'
          && baseSegments[3].type === 1 && baseSegments[3].value === '$id'
        ) {
          return '/foo/bar/$id';
        }
        if (l === 4
          && baseSegments[2].type === 1 && baseSegments[2].value === '$id'
          && baseSegments[3].type === 0 && baseSegments[3].value === 'bar'
        ) {
          return '/foo/$id/bar';
        }
        if (l === 4
          && baseSegments[2].type === 3 && baseSegments[2].value === '$bar'
          && baseSegments[3].type === 0 && baseSegments[3].value === 'qux'
        ) {
          return '/foo/$bar/qux';
        }
        if (l === 4
          && baseSegments[2].type === 1 && baseSegments[2].value === '$bar'
          && baseSegments[3].type === 0 && baseSegments[3].value === '/'
        ) {
          return '/foo/$bar/';
        }
      }
      if (l === 3
        && baseSegments[1].type === 0 && baseSegments[1].value === 'beep'
        && baseSegments[2].type === 0 && baseSegments[2].value === 'boop'
      ) {
        return '/beep/boop';
      }
      if (baseSegments[1].type === 0 && baseSegments[1].value === 'one') {
        if (l === 3
          && baseSegments[2].type === 0 && baseSegments[2].value === 'two'
        ) {
          return '/one/two';
        }
        if (l === 2) {
          return '/one';
        }
      }
      if (l === 3
        && baseSegments[1].type === 0 && baseSegments[1].value === 'api'
        && baseSegments[2].type === 1 && baseSegments[2].value === '$id'
      ) {
        return '/api/$id';
      }
      if (l === 3
        && baseSegments[1].type === 0 && baseSegments[1].value === 'posts'
        && baseSegments[2].type === 3 && baseSegments[2].value === '$slug'
      ) {
        return '/posts/$slug';
      }
      if (l === 3
        && baseSegments[1].type === 0 && baseSegments[1].value === 'files'
        && baseSegments[2].type === 2 && baseSegments[2].value === '$'
      ) {
        return '/files/$';
      }
      if (l === 2
        && baseSegments[1].type === 0 && baseSegments[1].value === 'about'
      ) {
        return '/about';
      }
      if (baseSegments[1].type === 1 && baseSegments[1].value === '$id') {
        if (l === 4
          && baseSegments[2].type === 0 && baseSegments[2].value === 'bar'
          && baseSegments[3].type === 0 && baseSegments[3].value === 'foo'
        ) {
          return '/$id/bar/foo';
        }
        if (l === 4
          && baseSegments[2].type === 0 && baseSegments[2].value === 'foo'
          && baseSegments[3].type === 0 && baseSegments[3].value === 'bar'
        ) {
          return '/$id/foo/bar';
        }
      }"
    `)
  })

  const buildMatcher = new Function('parsePathname', 'from', fn) as (
    parser: typeof parsePathname,
    from: string,
  ) => string | undefined

  test.each([
    '/users/profile/settings',
    '/foo/$bar/',
    '/foo/123',
    '/b/$id',
    '/b/123',
    '/foo/{-$bar}/qux',
    '/foo/123/qux',
    '/foo/qux',
  ])('matching %s', (s) => {
    const originalMatch = originalMatcher(s)
    const buildMatch = buildMatcher(parsePathname, s)
    console.log(
      `matching: ${s}, originalMatch: ${originalMatch}, buildMatch: ${buildMatch}`,
    )
    expect(buildMatch).toBe(originalMatch)
  })
})
