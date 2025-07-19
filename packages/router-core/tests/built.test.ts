import { expect, it } from 'vitest'
import { joinPaths, parsePathname, processRouteTree } from '../src'

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
  '/$id/bar/foo',
  '/$id/foo/bar',
  '/a/b/c/d/e/f',
  '/beep/boop',
  '/one/two',
  '/one'
])

const result = processRouteTree({ routeTree })

it('work in progress', () => {

  expect(result.flatRoutes.map(r => r.id)).toMatchInlineSnapshot(`
    [
      "/a/b/c/d/e/f",
      "/a/profile/settings",
      "/b/profile/settings",
      "/users/profile/settings",
      "/foo/bar/$id",
      "/a/profile",
      "/b/profile",
      "/beep/boop",
      "/one/two",
      "/users/profile",
      "/foo/$id/bar",
      "/a/user-{$id}",
      "/api/user-{$id}",
      "/b/user-{$id}",
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
  fn += `\nconst {type, value} = baseSegments[${initialDepth}];`

  function recursiveStaticMatch(
    parsedRoutes: Array<ReturnType<typeof parsePathname>>,
    depth = initialDepth,
  ) {
    const resolved = new Set<ReturnType<typeof parsePathname>>()
    for (const parsed of parsedRoutes) {
      if (resolved.has(parsed)) continue // already resolved
      console.log('\n')
      console.log('resolving: depth=', depth, 'parsed=', logParsed(parsed))
      console.log('\u001b[34m' + fn + '\u001b[0m')
      const currentSegment = parsed[depth]
      if (!currentSegment) {
        throw new Error("Implementation error: this should not happen")
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
        throw new Error("Implementation error: this should not happen")
      }
      const indent = '  '.repeat(depth - initialDepth)
      const lCondition = depth > initialDepth ? `l > ${depth} && ` : ''
      if (candidates.length > 1) {
        fn += `\n${indent}if (${lCondition}type === ${parsed[depth]!.type} && value === '${parsed[depth]!.value}') {`
        const deeper = candidates.filter((c) => c.length > depth + 1)
        const leaves = candidates.filter((c) => c.length === depth + 1)
        if (deeper.length + leaves.length !== candidates.length) {
          throw new Error("Implementation error: this should not happen")
        }
        if (deeper.length > 0) {
          fn += `\n${indent}  const {type, value} = baseSegments[${depth + 1}];`
          recursiveStaticMatch(deeper, depth + 1)
        }
        if (leaves.length > 1) {
          throw new Error(
            `Multiple candidates found for depth ${depth} with type ${parsed[depth]!.type} and value ${parsed[depth]!.value}: ${leaves.map(logParsed).join(', ')}`,
          )
        } else if (leaves.length === 1) {
          fn += `\n${indent}  if (l === ${leaves[0]!.length}) {`
          fn += `\n${indent}    return '/${leaves[0]!.slice(1).map((s) => s.value).join('/')}';`
          fn += `\n${indent}  }`
        }
      } else {
        const leaf = candidates[0]!
        const done = `return '/${leaf
          .slice(1)
          .map((s) => s.value)
          .join('/')}';`
        fn += `\n${indent}if (l === ${leaf.length}`
        for (let i = depth; i < leaf.length; i++) {
          const segment = leaf[i]!
          const type = i === depth ? 'type' : `baseSegments[${i}].type`
          const value = i === depth ? 'value' : `baseSegments[${i}].value`
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

  console.log('\u001b[34m' + fn + '\u001b[0m')

  expect(fn).toMatchInlineSnapshot(`
    "const baseSegments = parsePathname(from);
    const l = baseSegments.length;
    const {type, value} = baseSegments[1];
    if (type === 0 && value === 'a') {
      const {type, value} = baseSegments[2];
      if (l === 7
        && type === 0 && value === 'b'
        && baseSegments[3].type === 0 && baseSegments[3].value === 'c'
        && baseSegments[4].type === 0 && baseSegments[4].value === 'd'
        && baseSegments[5].type === 0 && baseSegments[5].value === 'e'
        && baseSegments[6].type === 0 && baseSegments[6].value === 'f'
      ) {
        return '/a/b/c/d/e/f';
      }
      if (l > 2 && type === 0 && value === 'profile') {
        const {type, value} = baseSegments[3];
        if (l === 4
          && type === 0 && value === 'settings'
        ) {
          return '/a/profile/settings';
        }
        if (l === 3) {
          return '/a/profile';
        }
      }
      if (l === 3
        && type === 1 && value === '$id'
      ) {
        return '/a/$id';
      }
      if (l === 3
        && type === 1 && value === '$id'
      ) {
        return '/a/$id';
      }
      if (l === 3
        && type === 3 && value === '$slug'
      ) {
        return '/a/$slug';
      }
      if (l === 3
        && type === 2 && value === '$'
      ) {
        return '/a/$';
      }
      if (l === 2) {
        return '/a';
      }
    }
    if (type === 0 && value === 'b') {
      const {type, value} = baseSegments[2];
      if (l > 2 && type === 0 && value === 'profile') {
        const {type, value} = baseSegments[3];
        if (l === 4
          && type === 0 && value === 'settings'
        ) {
          return '/b/profile/settings';
        }
        if (l === 3) {
          return '/b/profile';
        }
      }
      if (l === 3
        && type === 1 && value === '$id'
      ) {
        return '/b/$id';
      }
      if (l === 3
        && type === 1 && value === '$id'
      ) {
        return '/b/$id';
      }
      if (l === 3
        && type === 3 && value === '$slug'
      ) {
        return '/b/$slug';
      }
      if (l === 3
        && type === 2 && value === '$'
      ) {
        return '/b/$';
      }
      if (l === 2) {
        return '/b';
      }
    }
    if (type === 0 && value === 'users') {
      const {type, value} = baseSegments[2];
      if (l > 2 && type === 0 && value === 'profile') {
        const {type, value} = baseSegments[3];
        if (l === 4
          && type === 0 && value === 'settings'
        ) {
          return '/users/profile/settings';
        }
        if (l === 3) {
          return '/users/profile';
        }
      }
      if (l === 3
        && type === 1 && value === '$id'
      ) {
        return '/users/$id';
      }
    }
    if (type === 0 && value === 'foo') {
      const {type, value} = baseSegments[2];
      if (l === 4
        && type === 0 && value === 'bar'
        && baseSegments[3].type === 1 && baseSegments[3].value === '$id'
      ) {
        return '/foo/bar/$id';
      }
      if (l === 4
        && type === 1 && value === '$id'
        && baseSegments[3].type === 0 && baseSegments[3].value === 'bar'
      ) {
        return '/foo/$id/bar';
      }
    }
    if (l === 3
      && type === 0 && value === 'beep'
      && baseSegments[2].type === 0 && baseSegments[2].value === 'boop'
    ) {
      return '/beep/boop';
    }
    if (type === 0 && value === 'one') {
      const {type, value} = baseSegments[2];
      if (l === 3
        && type === 0 && value === 'two'
      ) {
        return '/one/two';
      }
      if (l === 2) {
        return '/one';
      }
    }
    if (l === 3
      && type === 0 && value === 'api'
      && baseSegments[2].type === 1 && baseSegments[2].value === '$id'
    ) {
      return '/api/$id';
    }
    if (l === 3
      && type === 0 && value === 'posts'
      && baseSegments[2].type === 3 && baseSegments[2].value === '$slug'
    ) {
      return '/posts/$slug';
    }
    if (l === 3
      && type === 0 && value === 'files'
      && baseSegments[2].type === 2 && baseSegments[2].value === '$'
    ) {
      return '/files/$';
    }
    if (l === 2
      && type === 0 && value === 'about'
    ) {
      return '/about';
    }
    if (type === 1 && value === '$id') {
      const {type, value} = baseSegments[2];
      if (l === 4
        && type === 0 && value === 'bar'
        && baseSegments[3].type === 0 && baseSegments[3].value === 'foo'
      ) {
        return '/$id/bar/foo';
      }
      if (l === 4
        && type === 0 && value === 'foo'
        && baseSegments[3].type === 0 && baseSegments[3].value === 'bar'
      ) {
        return '/$id/foo/bar';
      }
    }"
  `)

  const yo = new Function('parsePathname', 'from', fn) as (
    parser: typeof parsePathname,
    from: string,
  ) => string | undefined
  expect(yo(parsePathname, '/users/profile/settings')).toBe(
    '/users/profile/settings',
  )
})
