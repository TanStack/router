import { describe, expect, it, test } from 'vitest'
import { format } from 'prettier'
import {
  joinPaths,
  matchPathname,
  parsePathname,
  processRouteTree,
} from '../src'
import { compileMatcher } from '../src/compile-matcher'
import type { CompiledMatcher } from '../src/compile-matcher'

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

// required keys on a `route` object for `processRouteTree` to correctly generate `flatRoutes`
// - id
// - children
// - isRoot
// - path
// - fullPath

const result = processRouteTree({ routeTree })

function originalMatcher(
  from: string,
  fuzzy?: boolean,
): readonly [string, Record<string, string>] | undefined {
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

  const fn = compileMatcher(result.flatRoutes)

  it('generates a matching function', async () => {
    expect(await format(fn, { parser: 'typescript' })).toMatchInlineSnapshot(`
      "const s = parsePathname(from[0] === "/" ? from : "/" + from, cache).map(
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
      const [, s1, s2, s3, s4, s5, s6] = s;
      const sc1 = s1?.toLowerCase();
      const sc2 = s2?.toLowerCase();
      const sc3 = s3?.toLowerCase();
      const sc4 = s4?.toLowerCase();
      const sc5 = s5?.toLowerCase();
      const sc6 = s6?.toLowerCase();
      if (
        length(7) &&
        sc1 === "a" &&
        sc2 === "b" &&
        sc3 === "c" &&
        sc4 === "d" &&
        sc5 === "e" &&
        sc6 === "f"
      )
        return ["/a/b/c/d/e/f", params({}, 7)];
      if (length(5) && sc1 === "z" && sc2 === "y" && sc3 === "x") {
        if (sc4 === "u") return ["/z/y/x/u", params({}, 5)];
        if (sc4 === "v") return ["/z/y/x/v", params({}, 5)];
        if (sc4 === "w") return ["/z/y/x/w", params({}, 5)];
      }
      if (length(4)) {
        if (sc2 === "profile" && sc3 === "settings") {
          if (sc1 === "a") return ["/a/profile/settings", params({}, 4)];
          if (sc1 === "b") return ["/b/profile/settings", params({}, 4)];
          if (sc1 === "users") return ["/users/profile/settings", params({}, 4)];
        }
        if (sc1 === "z" && sc2 === "y" && sc3 === "x")
          return ["/z/y/x", params({}, 4)];
        if (sc1 === "foo" && sc2 === "bar")
          return ["/foo/bar/$id", params({ id: s3 }, 4)];
      }
      if (l >= 3) {
        if (length(3)) {
          if (sc2 === "profile") {
            if (sc1 === "a") return ["/a/profile", params({}, 3)];
            if (sc1 === "b") return ["/b/profile", params({}, 3)];
          }
          if (sc1 === "beep" && sc2 === "boop") return ["/beep/boop", params({}, 3)];
          if (sc1 === "one" && sc2 === "two") return ["/one/two", params({}, 3)];
          if (sc1 === "users" && sc2 === "profile")
            return ["/users/profile", params({}, 3)];
        }
        if (length(4) && sc1 === "foo") {
          if (sc3 === "bar") return ["/foo/$id/bar", params({ id: s2 }, 4)];
          if (sc3 === "qux") return ["/foo/{-$bar}/qux", params({ bar: s2 }, 4)];
        }
        if (length(3)) {
          if (sc1 === "foo" && sc2 === "qux")
            return ["/foo/{-$bar}/qux", params({}, 3)];
          if (sc1 === "a" && sc2?.startsWith("user-"))
            return ["/a/user-{$id}", params({ id: s2.slice(5) }, 3)];
          if (sc1 === "api" && sc2?.startsWith("user-"))
            return ["/api/user-{$id}", params({ id: s2.slice(5) }, 3)];
          if (sc1 === "b" && sc2?.startsWith("user-"))
            return ["/b/user-{$id}", params({ id: s2.slice(5) }, 3)];
        }
        if (length(4) && sc1 === "foo" && sc3 === "/")
          return ["/foo/$bar/", params({ bar: s2 }, 4)];
        if (length(3)) {
          if (sc1 === "foo") return ["/foo/$bar/", params({ bar: s2 }, 3)];
          if (sc1 === "a") return ["/a/$id", params({ id: s2 }, 3)];
          if (sc1 === "b") return ["/b/$id", params({ id: s2 }, 3)];
          if (sc1 === "foo") return ["/foo/$bar", params({ bar: s2 }, 3)];
          if (sc1 === "users") return ["/users/$id", params({ id: s2 }, 3)];
          if (sc1 === "a") return ["/a/{-$slug}", params({ slug: s2 }, 3)];
        }
      }
      if (l >= 2) {
        if (length(2) && sc1 === "a") return ["/a/{-$slug}", params({}, 2)];
        if (length(3) && sc1 === "b") return ["/b/{-$slug}", params({ slug: s2 }, 3)];
        if (length(2) && sc1 === "b") return ["/b/{-$slug}", params({}, 2)];
        if (length(3) && sc1 === "posts")
          return ["/posts/{-$slug}", params({ slug: s2 }, 3)];
        if (length(2) && sc1 === "posts") return ["/posts/{-$slug}", params({}, 2)];
        if (l >= 3) {
          if (
            sc1 === "cache" &&
            sc2?.startsWith("temp_") &&
            s[l - 1].toLowerCase().endsWith(".log")
          )
            return [
              "/cache/temp_{$}.log",
              {
                _splat: s.slice(2).join("/").slice(5, -4),
                "*": s.slice(2).join("/").slice(5, -4),
              },
            ];
          if (sc1 === "images" && sc2?.startsWith("thumb_"))
            return [
              "/images/thumb_{$}",
              {
                _splat: s.slice(2).join("/").slice(6),
                "*": s.slice(2).join("/").slice(6),
              },
            ];
          if (sc1 === "logs" && s[l - 1].toLowerCase().endsWith(".txt"))
            return [
              "/logs/{$}.txt",
              {
                _splat: s.slice(2).join("/").slice(0, -4),
                "*": s.slice(2).join("/").slice(0, -4),
              },
            ];
        }
        if (sc1 === "a")
          return [
            "/a/$",
            { _splat: s.slice(2).join("/"), "*": s.slice(2).join("/") },
          ];
        if (sc1 === "b")
          return [
            "/b/$",
            { _splat: s.slice(2).join("/"), "*": s.slice(2).join("/") },
          ];
        if (sc1 === "files")
          return [
            "/files/$",
            { _splat: s.slice(2).join("/"), "*": s.slice(2).join("/") },
          ];
        if (length(2)) {
          if (sc1 === "a") return ["/a", params({}, 2)];
          if (sc1 === "about") return ["/about", params({}, 2)];
          if (sc1 === "b") return ["/b", params({}, 2)];
          if (sc1 === "one") return ["/one", params({}, 2)];
        }
      }
      if (length(1)) return ["/", params({}, 1)];
      if (length(4) && sc2 === "bar" && sc3 === "foo")
        return ["/$id/bar/foo", params({ id: s1 }, 4)];
      if (length(4) && sc2 === "foo" && sc3 === "bar")
        return ["/$id/foo/bar", params({ id: s1 }, 4)];
      "
    `)
  })

  const buildMatcher = new Function(
    'parsePathname',
    'from',
    'fuzzy',
    'cache',
    fn,
  ) as CompiledMatcher

  test.each([
    '',
    '/',
    '/users/profile/settings',
    '/foo/123',
    '/FOO/123',
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
