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
  '/foo/{-$bar}/$baz/qux',
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
        "/foo/{-$bar}/$baz/qux",
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

  function segmentsToRegex(segments: ReadonlyArray<Segment>): string | undefined {
    if (segments.every((s) => s.type === SEGMENT_TYPE_PATHNAME)) return
    let re = ''
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]!
      if (s.type === SEGMENT_TYPE_PATHNAME) {
        if (s.value === '/') {
          if (i === segments.length - 1) {
            re += '/?'
          }
        } else {
          let skip = 0
          for (let j = i + 1; j < segments.length; j++) {
            if (segments[j]!.type !== SEGMENT_TYPE_PATHNAME || segments[j]!.value === '/') {
              break
            }
            skip++
          }
          if (skip) {
            re += `(/[^/]*){${skip + 1}}`
          } else {
            re += '/[^/]*'
          }
        }
      } else if (s.type === SEGMENT_TYPE_PARAM) {
        const prefix = s.prefixSegment ? RegExp.escape(s.prefixSegment) : ''
        const suffix = s.suffixSegment ? RegExp.escape(s.suffixSegment) : ''
        const name = s.value.replace(/^\$/, '')
        const param = `(?<${name}>[^/]*)`
        re += `/${prefix}${param}${suffix}`
      } else if (s.type === SEGMENT_TYPE_OPTIONAL_PARAM) {
        const name = s.value.replace(/^\$/, '')
        const param = `(?<${name}>[^/]*)`
        re += `(?:/${param})?`
      } else if (s.type === SEGMENT_TYPE_WILDCARD) {
        const prefix = s.prefixSegment ? RegExp.escape(s.prefixSegment) : ''
        const suffix = s.suffixSegment ? RegExp.escape(s.suffixSegment) : ''
        const param = `(?<_splat>.*)`
        if (prefix || suffix) {
          re += `/${prefix}${param}${suffix}`
        } else {
          re += `/?${param}`
        }
        break
      } else {
        throw new Error(`Unknown segment type: ${s.type}`)
      }
    }
    return `^${re}$`
  }

  const obj: Record<string, string> = {}

  for (const route of result.flatRoutes) {
    const segments = parsePathname(route.fullPath)
    const re = segmentsToRegex(segments)
    if (!re) continue
    obj[route.fullPath] = re
  }

  it('works', () => {
    console.log(obj)
    expect(obj).toMatchInlineSnapshot(`
      {
        "/$id/bar/foo": "^/(?<id>[^/]*)(/[^/]*){2}/[^/]*$",
        "/$id/foo/bar": "^/(?<id>[^/]*)(/[^/]*){2}/[^/]*$",
        "/a/$": "^/[^/]*/?(?<_splat>.*)$",
        "/a/$id": "^/[^/]*/(?<id>[^/]*)$",
        "/a/user-{$id}": "^/[^/]*/\\x75ser\\x2d(?<id>[^/]*)$",
        "/a/{-$slug}": "^/[^/]*(?:/(?<slug>[^/]*))?$",
        "/api/user-{$id}": "^/[^/]*/\\x75ser\\x2d(?<id>[^/]*)$",
        "/b/$": "^/[^/]*/?(?<_splat>.*)$",
        "/b/$id": "^/[^/]*/(?<id>[^/]*)$",
        "/b/user-{$id}": "^/[^/]*/\\x75ser\\x2d(?<id>[^/]*)$",
        "/b/{-$slug}": "^/[^/]*(?:/(?<slug>[^/]*))?$",
        "/cache/temp_{$}.log": "^/[^/]*/\\x74emp_(?<_splat>.*)\\.log$",
        "/files/$": "^/[^/]*/?(?<_splat>.*)$",
        "/foo/$bar": "^/[^/]*/(?<bar>[^/]*)$",
        "/foo/$bar/": "^/[^/]*/(?<bar>[^/]*)/?$",
        "/foo/$id/bar": "^/[^/]*/(?<id>[^/]*)/[^/]*$",
        "/foo/bar/$id": "^(/[^/]*){2}/[^/]*/(?<id>[^/]*)$",
        "/foo/{-$bar}/$baz/qux": "^/[^/]*(?:/(?<bar>[^/]*))?/(?<baz>[^/]*)/[^/]*$",
        "/foo/{-$bar}/qux": "^/[^/]*(?:/(?<bar>[^/]*))?/[^/]*$",
        "/images/thumb_{$}": "^/[^/]*/\\x74humb_(?<_splat>.*)$",
        "/logs/{$}.txt": "^/[^/]*/(?<_splat>.*)\\.txt$",
        "/posts/{-$slug}": "^/[^/]*(?:/(?<slug>[^/]*))?$",
        "/users/$id": "^/[^/]*/(?<id>[^/]*)$",
      }
    `)
  })

  function getParams(path: string, input: string) {
    const str = obj[path]
    if (!str) return {}
    const match = new RegExp(str).exec(input)
    return match?.groups || {}
  }

  function isMatched(path: string, input: string) {
    const str = obj[path]
    if (!str) return false
    return new RegExp(str).test(input)
  }

  describe.each([
    ['/a/$id', '/a/123', { id: '123' }],
    ['/a/{-$slug}', '/a/hello', { slug: 'hello' }],
    ['/a/{-$slug}', '/a/', { slug: '' }],
    ['/a/{-$slug}', '/a', { slug: undefined }],
    ['/b/user-{$id}', '/b/user-123', { id: '123' }],
    ['/logs/{$}.txt', '/logs/2022/01/01/error.txt', { _splat: '2022/01/01/error' }],
    ['/foo/{-$bar}/qux', '/foo/hello/qux', { bar: 'hello' }],
    ['/foo/{-$bar}/qux', '/foo/qux', { bar: undefined }],
    ['/foo/{-$bar}/$baz/qux', '/foo/qux/qux', { bar: undefined, baz: 'qux' }],
    ['/foo/$bar/', '/foo/qux/', { bar: 'qux' }],
  ])('getParams(%s, %s) === %j', (path, input, expected) => {
    it('matches', () => expect(isMatched(path, input)).toBeTruthy())
    it('returns', () => expect(getParams(path, input)).toEqual(expected))
  })
})