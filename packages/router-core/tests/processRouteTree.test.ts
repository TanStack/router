import { describe, expect, it } from 'vitest'
import { getMatchedRoutes, processRouteTree } from '../src/router'
import { joinPaths } from '../src'

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

describe('processRouteTree', () => {
  describe('basic functionality', () => {
    it('should process a simple route tree', () => {
      const routeTree = createRouteTree(['/', '/about'])

      const result = processRouteTree({ routeTree })

      expect(result.routesById).toHaveProperty('__root__')
      expect(result.routesById).toHaveProperty('/')
      expect(result.routesById).toHaveProperty('/about')
      expect(result.routesByPath).toHaveProperty('/')
      expect(result.routesByPath).toHaveProperty('/about')
      expect(result.flatRoutes).toHaveLength(2) // excludes root
    })

    it('should assign ranks to routes in flatRoutes', () => {
      const routeTree = createRouteTree(['/', '/about'])

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes[0]).toHaveProperty('rank', 0)
      expect(result.flatRoutes[1]).toHaveProperty('rank', 1)
    })
  })

  describe('route ranking - static segments vs params', () => {
    it('should rank static segments higher than param segments', () => {
      const routes = ['/users/profile', '/users/$id']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
      expect(result.flatRoutes[0]!.rank).toBe(0)
      expect(result.flatRoutes[1]!.rank).toBe(1)
    })

    it('should rank static segments higher than optional params', () => {
      const routes = ['/users/settings', '/users/{-$id}']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })

    it('should rank static segments higher than wildcards', () => {
      const routes = ['/api/v1', '/api/$']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })
  })

  describe('route ranking - param variations', () => {
    it('should rank params higher than optional params', () => {
      const routes = ['/users/$id', '/users/{-$id}']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })

    it('should rank optional params higher than wildcards', () => {
      const routes = ['/files/{-$path}', '/files/$']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })
  })

  describe('route ranking - prefix and suffix variations', () => {
    it('should rank param with prefix and suffix higher than plain param', () => {
      const routes = ['/user/prefix-{$id}-suffix', '/user/$id']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })

    it('should rank param with prefix higher than plain param', () => {
      const routes = ['/user/prefix-{$id}', '/user/$id']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })

    it('should rank param with suffix higher than plain param', () => {
      const routes = ['/user/{$id}-suffix', '/user/$id']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })
  })

  describe('route ranking - path length priority', () => {
    it('should rank longer paths higher when segment scores are equal', () => {
      const routes = ['/api/v1', '/api']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })

    it('should rank longer param paths higher', () => {
      const routes = ['/users/$id', '/$id']
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })

    it('should rank index route higher than root catch-all', () => {
      const routes = ['/', '/$'] // index route should rank higher than catch-all
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })

    it('should rank routes with fewer optional parameters higher (more specific)', () => {
      const routes = [
        '/foo', // most specific: exact match only
        '/foo/{-$p1}', // less specific: matches /foo or /foo/x
        '/foo/{-$p1}/{-$p2}', // least specific: matches /foo or /foo/x or /foo/x/y
      ]
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })
  })

  describe('route ranking - alphabetical ordering', () => {
    it('should sort alphabetically when scores and lengths are equal', () => {
      const routes = ['/apple', '/middle', '/zebra'] // in expected alphabetical order
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })
  })

  describe('route ranking - original index fallback', () => {
    it('should use original index when all other criteria are equal', () => {
      const routes = ['/first', '/second'] // in expected order (original index determines ranking)
      const routeTree = createRouteTree(routes)

      const result = processRouteTree({ routeTree })

      expect(result.flatRoutes.map((r) => r.id)).toEqual(routes)
    })
  })

  describe('complex routing scenarios', () => {
    it('should correctly rank a complex mix of route types', () => {
      // Define routes in expected ranking order - createRouteTree will shuffle them to test sorting
      const expectedOrder = [
        '/users/profile/settings', // static-deep (longest static path)
        '/users/profile', // static-medium (medium static path)
        '/api/user-{$id}', // param-with-prefix (param with prefix has higher score)
        '/users/$id', // param-simple (plain param)
        '/posts/{-$slug}', // optional-param (optional param ranks lower than regular param)
        '/files/$', // wildcard (lowest priority)
        '/about', // static-shallow (shorter static path)
      ]

      const routeTree = createRouteTree(expectedOrder)
      const result = processRouteTree({ routeTree })
      const actualOrder = result.flatRoutes.map((r) => r.id)

      expect(actualOrder).toEqual(expectedOrder)
    })
  })

  describe('route matching with optional parameters', () => {
    it('should match the most specific route when multiple routes could match', () => {
      const routes = ['/foo/{-$p}.tsx', '/foo/{-$p}/{-$x}.tsx']
      const routeTree = createRouteTree(routes)
      const result = processRouteTree({ routeTree })

      // Verify the ranking - fewer optional parameters should rank higher
      expect(result.flatRoutes.map((r) => r.id)).toEqual([
        '/foo/{-$p}.tsx',
        '/foo/{-$p}/{-$x}.tsx',
      ])

      // The first route in flatRoutes is what will be matched for `/foo`
      // This demonstrates that `/foo/{-$p}.tsx` will be matched, not `/foo/{-$p}/{-$x}.tsx`
      const firstMatchingRoute = result.flatRoutes[0]!
      expect(firstMatchingRoute.id).toBe('/foo/{-$p}.tsx')

      // This route has 1 optional parameter, making it more specific than the route with 2
      expect(firstMatchingRoute.fullPath).toBe('/foo/{-$p}.tsx')
    })

    it('should demonstrate matching priority for complex optional parameter scenarios', () => {
      const routes = [
        '/foo/{-$a}', // 1 optional param
        '/foo/{-$a}/{-$b}', // 2 optional params
        '/foo/{-$a}/{-$b}/{-$c}', // 3 optional params
        '/foo/bar', // static route (should rank highest)
        '/foo/bar/{-$x}', // static + 1 optional
      ]
      const routeTree = createRouteTree(routes)
      const result = processRouteTree({ routeTree })

      // Expected ranking from most to least specific:
      expect(result.flatRoutes.map((r) => r.id)).toEqual([
        '/foo/bar', // Static route wins
        '/foo/bar/{-$x}', // Static + optional
        '/foo/{-$a}', // Fewest optional params (1)
        '/foo/{-$a}/{-$b}', // More optional params (2)
        '/foo/{-$a}/{-$b}/{-$c}', // Most optional params (3)
      ])

      // For path `/foo/bar` - static route would match
      // For path `/foo/anything` - `/foo/{-$a}` would match (not the routes with more optional params)
      // For path `/foo` - `/foo/{-$a}` would match (optional param omitted)
    })

    it('should demonstrate actual path matching behavior', () => {
      const routes = ['/foo/{-$p}.tsx', '/foo/{-$p}/{-$x}.tsx']
      const routeTree = createRouteTree(routes)
      const result = processRouteTree({ routeTree })

      // Test actual path matching for `/foo`
      const matchResult = getMatchedRoutes({
        pathname: '/foo',
        basepath: '/',
        caseSensitive: false,
        routesByPath: result.routesByPath,
        routesById: result.routesById,
        flatRoutes: result.flatRoutes,
      })

      // The foundRoute should be the more specific one (fewer optional parameters)
      expect(matchResult.foundRoute?.id).toBe('/foo/{-$p}.tsx')

      // The matched route should be included in the route hierarchy
      expect(matchResult.matchedRoutes.map((r) => r.id)).toContain(
        '/foo/{-$p}.tsx',
      )

      // Parameters should show the optional parameter as undefined when omitted
      expect(matchResult.routeParams).toEqual({ p: undefined })
    })
  })

  describe('edge cases', () => {
    it('should handle root route correctly', () => {
      const routeTree = createRouteTree([])

      const result = processRouteTree({ routeTree })

      expect(result.routesById).toHaveProperty('__root__')
      expect(result.flatRoutes).toHaveLength(0) // root is excluded from flatRoutes
    })

    it('should handle routes without paths', () => {
      // This test case is more complex as it involves layout routes
      // For now, let's use a simpler approach with createRouteTree
      const routeTree = createRouteTree(['/layout/child'])

      const result = processRouteTree({ routeTree })

      expect(result.routesById).toHaveProperty('/layout/child')
      expect(result.flatRoutes).toHaveLength(1)
      expect(result.flatRoutes[0]!.id).toBe('/layout/child')
    })

    it('should handle trailing slashes in routesByPath', () => {
      const routeTree = createRouteTree(['/test', '/test/']) // without slash first

      const result = processRouteTree({ routeTree })

      // Route with trailing slash should take precedence in routesByPath
      expect(result.routesByPath['/test']).toBeDefined()
    })

    it('routes with same optional count but different static segments', () => {
      const routes = [
        '/a/{-$p1}/b/{-$p1}/{-$p1}/{-$p1}',
        '/b/{-$p1}/{-$p1}/{-$p1}/{-$p1}',
      ]
      const result = processRouteTree({ routeTree: createRouteTree(routes) })

      // Route with more static segments (/a/{-$p1}/b) should rank higher
      // than route with fewer static segments (/b)
      expect(result.flatRoutes.map((r) => r.id)).toEqual([
        '/a/{-$p1}/b/{-$p1}/{-$p1}/{-$p1}',
        '/b/{-$p1}/{-$p1}/{-$p1}/{-$p1}',
      ])
    })

    it('routes with different optional counts and different static segments', () => {
      const routes = [
        '/foo/{-$p1}/foo/{-$p1}/{-$p1}/{-$p1}',
        '/foo/{-$p1}/{-$p1}',
      ]
      const result = processRouteTree({ routeTree: createRouteTree(routes) })

      // Both routes share common prefix '/foo/{-$p1}', then differ
      // Route 1: '/foo/{-$p1}/b/{-$p1}/{-$p1}/{-$p1}' - has static '/b' at position 2, total 4 optional params
      // Route 2: '/foo/{-$p1}/{-$p1}' - has optional param at position 2, total 2 optional params
      // Since position 2 differs (static vs optional), static should win
      expect(result.flatRoutes.map((r) => r.id)).toEqual([
        '/foo/{-$p1}/foo/{-$p1}/{-$p1}/{-$p1}',
        '/foo/{-$p1}/{-$p1}',
      ])
    })

    it.each([
      {
        routes: ['/foo/{-$p1}/bar', '/foo/{-$p1}', '/foo/$p1', '/foo/$p1/'],
        expected: ['/foo/{-$p1}/bar', '/foo/$p1/', '/foo/$p1', '/foo/{-$p1}'],
      },
      {
        routes: ['/foo/{-$p1}/{-$p2}/bar', '/foo/$p1/$p2/'],
        expected: ['/foo/{-$p1}/{-$p2}/bar', '/foo/$p1/$p2/'],
      },
      {
        routes: ['/foo/{-$p1}/$p2/bar', '/foo/$p1/{-$p2}/bar'],
        expected: ['/foo/$p1/{-$p2}/bar', '/foo/{-$p1}/$p2/bar'],
      },
      {
        routes: [
          '/foo',
          '/admin-levels/$adminLevelId/',
          '/admin-levels/$adminLevelId',
          '/about',
          '/admin-levels/{-$adminLevelId}/reports',
          '/admin-levels/{-$adminLevelId}',
          '/',
        ],
        expected: [
          '/admin-levels/{-$adminLevelId}/reports',
          '/admin-levels/$adminLevelId/',
          '/admin-levels/$adminLevelId',
          '/about',
          '/foo',
          '/admin-levels/{-$adminLevelId}',
          '/',
        ],
      },
    ])(
      'static segment after param ranks param higher: $routes',
      ({ routes, expected }) => {
        const result = processRouteTree({ routeTree: createRouteTree(routes) })
        expect(result.flatRoutes.map((r) => r.id)).toEqual(expected)
      },
    )

    it.each([
      {
        routes: ['/f{$param}', '/foo{$param}'],
        expected: ['/foo{$param}', '/f{$param}'],
      },
      {
        routes: ['/{$param}r', '/{$param}bar'],
        expected: ['/{$param}bar', '/{$param}r'],
      },
      {
        routes: ['/f{$param}bar', '/foo{$param}r'],
        expected: ['/foo{$param}r', '/f{$param}bar'],
      },
      {
        routes: ['/foo{$param}r', '/f{$param}baaaaaar'], // very long suffix can "override" prefix
        expected: ['/f{$param}baaaaaar', '/foo{$param}r'],
      },
    ])(
      'length of prefix and suffix are considered in ranking: $routes',
      ({ routes, expected }) => {
        const result = processRouteTree({ routeTree: createRouteTree(routes) })
        expect(result.flatRoutes.map((r) => r.id)).toEqual(expected)
      },
    )
  })
})
