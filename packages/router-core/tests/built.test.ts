import { describe, expect, it } from 'vitest'
import {
  joinPaths,
  parsePathname,
  processRouteTree,
  removeBasepath,
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
])

const result = processRouteTree({ routeTree })

it('work in progress', () => {
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
  let fn = 'const toSegments = parsePathname(to);'
  fn += '\nconst l = toSegments.length;'
  fn += `\nconst s = toSegments[${initialDepth}];`

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
      const candidates = parsedRoutes.filter((r) => {
        const rParsed = r[depth]
        if (!rParsed) return false
        return (
          parsed[depth] &&
          rParsed.type === parsed[depth].type &&
          rParsed.value === parsed[depth].value &&
          rParsed.hasStaticAfter === parsed[depth].hasStaticAfter &&
          rParsed.prefixSegment === parsed[depth].prefixSegment &&
          rParsed.suffixSegment === parsed[depth].suffixSegment
        )
      })
      console.log('candidates:', candidates.map(logParsed))
      if (candidates.length === 0) {
        continue // TODO: this should not happen but it does, fix this
        console.log(
          parsedRoutes.length,
          parsedRoutes.map((r) => r.map((s) => s.value).join('/')),
        )
        throw new Error(
          `No candidates found for depth ${depth} with type ${parsed[depth]!.type} and value ${parsed[depth]!.value}`,
        )
      }
      const indent = '  '.repeat(depth - initialDepth)
      fn += `\n${indent}if (l > ${depth} && s.type === ${parsed[depth]!.type} && s.value === '${parsed[depth]!.value}') {`
      if (candidates.length > 1) {
        const deeper = candidates.filter((c) => c.length > depth - 1)
        const leaves = candidates.filter((c) => c.length === depth - 1)
        if (deeper.length > 0) {
          fn += `\n${indent}  const s = toSegments[${depth + 1}];`
          recursiveStaticMatch(deeper, depth + 1)
        }
        if (leaves.length > 1) {
          throw new Error(
            `Multiple candidates found for depth ${depth} with type ${parsed[depth]!.type} and value ${parsed[depth]!.value}: ${leaves.map(logParsed).join(', ')}`,
          )
        } else if (leaves.length === 1) {
          fn += `\n${indent}  return '/${leaves[0]!
            .slice(1)
            .map((s) => s.value)
            .join('/')}';` // return the full path
        } else {
          fn += `\n${indent}  return undefined;` // no match found
        }
      } else {
        fn += `\n${indent}  return '/${candidates[0]!
          .slice(1)
          .map((s) => s.value)
          .join('/')}';` // return the full path
      }
      fn += `\n${indent}}`
      candidates.forEach((c) => resolved.add(c))
    }
  }

  recursiveStaticMatch(parsedRoutes)

  console.log('\u001b[34m' + fn + '\u001b[0m')

  expect(fn).toMatchInlineSnapshot(`
    "const toSegments = parsePathname(to);
    const l = toSegments.length;
    const s = toSegments[1];
    if (l > 1 && s.type === 0 && s.value === 'a') {
      const s = toSegments[2];
      if (l > 2 && s.type === 0 && s.value === 'profile') {
        const s = toSegments[3];
        if (l > 3 && s.type === 0 && s.value === 'settings') {
          return '/a/profile/settings';
        }
        return undefined;
      }
      if (l > 2 && s.type === 1 && s.value === '$id') {
        return '/a/$id';
      }
      if (l > 2 && s.type === 1 && s.value === '$id') {
        return '/a/$id';
      }
      if (l > 2 && s.type === 3 && s.value === '$slug') {
        return '/a/$slug';
      }
      if (l > 2 && s.type === 2 && s.value === '$') {
        return '/a/$';
      }
      return undefined;
    }
    if (l > 1 && s.type === 0 && s.value === 'b') {
      const s = toSegments[2];
      if (l > 2 && s.type === 0 && s.value === 'profile') {
        const s = toSegments[3];
        if (l > 3 && s.type === 0 && s.value === 'settings') {
          return '/b/profile/settings';
        }
        return undefined;
      }
      if (l > 2 && s.type === 1 && s.value === '$id') {
        return '/b/$id';
      }
      if (l > 2 && s.type === 1 && s.value === '$id') {
        return '/b/$id';
      }
      if (l > 2 && s.type === 3 && s.value === '$slug') {
        return '/b/$slug';
      }
      if (l > 2 && s.type === 2 && s.value === '$') {
        return '/b/$';
      }
      return undefined;
    }
    if (l > 1 && s.type === 0 && s.value === 'users') {
      const s = toSegments[2];
      if (l > 2 && s.type === 0 && s.value === 'profile') {
        const s = toSegments[3];
        if (l > 3 && s.type === 0 && s.value === 'settings') {
          return '/users/profile/settings';
        }
        return undefined;
      }
      if (l > 2 && s.type === 1 && s.value === '$id') {
        return '/users/$id';
      }
      return undefined;
    }
    if (l > 1 && s.type === 0 && s.value === 'api') {
      return '/api/$id';
    }
    if (l > 1 && s.type === 0 && s.value === 'posts') {
      return '/posts/$slug';
    }
    if (l > 1 && s.type === 0 && s.value === 'files') {
      return '/files/$';
    }
    if (l > 1 && s.type === 0 && s.value === 'about') {
      return '/about';
    }"
  `)

  const yo = new Function('parsePathname', 'to', fn) as (
    parser: typeof parsePathname,
    to: string,
  ) => string | undefined
  expect(yo(parsePathname, '/users/profile/settings')).toBe(
    '/users/profile/settings',
  )
})
