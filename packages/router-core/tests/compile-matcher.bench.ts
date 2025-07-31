import { bench, describe } from 'vitest'
import {
  joinPaths,
  matchPathname,
  parsePathname,
  processRouteTree,
} from '../src'
import { createLRUCache } from '../src/lru-cache'
import { compileMatcher } from '../src/compile-matcher'
import type { CompiledMatcher } from '../src/compile-matcher'
import type { ParsePathnameCache } from '../src/path'

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
  '/compiled/two',
  '/compiled',
  '/z/y/x/w',
  '/z/y/x/v',
  '/z/y/x/u',
  '/z/y/x',
  '/images/thumb_{$}', // wildcard with prefix
  '/logs/{$}.txt', // wildcard with suffix
  '/cache/temp_{$}.log', // wildcard with prefix and suffix
  '/momomo/{-$one}/$two'
])
const result = processRouteTree({ routeTree })

const compiled = (() => {
  const cache: ParsePathnameCache = createLRUCache(1000)
  const fn = compileMatcher(result.flatRoutes)
  const buildMatcher = new Function(
    'parsePathname',
    'from',
    'fuzzy',
    'cache',
    fn,
  ) as CompiledMatcher
  const wrappedMatcher = (from: string) => {
    return buildMatcher(parsePathname, from, false, cache)
  }
  return wrappedMatcher
})()

const original = (() => {
  const cache: ParsePathnameCache = createLRUCache(1000)

  const wrappedMatcher = (from: string) => {
    const match = result.flatRoutes.find((r) =>
      matchPathname('/', from, { to: r.fullPath }, cache),
    )
    return match
  }
  return wrappedMatcher
})()

const testCases = [
  '',
  '/',
  '/users/profile/settings',
  '/foo/123',
  '/foo/123/',
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
  '/momomo/1111/2222',
  '/momomo/2222',
]

describe('build.bench', () => {
  bench(
    'original',
    () => {
      for (const from of testCases) {
        original(from)
      }
    },
    { warmupIterations: 10 },
  )
  bench(
    'compiled',
    () => {
      for (const from of testCases) {
        compiled(from)
      }
    },
    { warmupIterations: 10 },
  )
})
