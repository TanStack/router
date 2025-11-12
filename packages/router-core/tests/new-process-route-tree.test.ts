import { describe, expect, it } from 'vitest'
import {
  findRouteMatch,
  processFlatRouteList,
  processRouteTree,
} from '../src/new-process-route-tree'
import type { AnyRoute, RouteMask } from '../src'

// import { createLRUCache } from '../src/lru-cache'
// import { processRouteTree as oldProcessRouteTree } from './old-process-route-tree'
// import { matchPathname } from './old-path'
// import big from '../src/Untitled-4.json'

function makeTree(routes: Array<string>) {
  return processRouteTree({
    id: '__root__',
    fullPath: '/',
    path: '/',
    children: routes.map((route) => ({
      id: route,
      fullPath: route,
      path: route,
    })),
  }).processedTree
}

// describe('foo', () => {
// 	it('old', () => {
// 		const { flatRoutes } = oldProcessRouteTree({ routeTree: big })
// 		const oldFindMatch = (path: string) => {
// 			for (const route of flatRoutes) {
// 				const params = matchPathname(path, { to: route.fullPath })
// 				if (params) return { route, params }
// 			}
// 			return null
// 		}
// 		expect(oldFindMatch('/')?.route.id).toMatchInlineSnapshot(`"__root__"`)
// 	})
// 	it('comp', () => {
// 		const { flatRoutes } = oldProcessRouteTree({
// 			routeTree: {
// 				id: '__root__',
// 				fullPath: '/',
// 				path: '/',
// 				children: [
// 					{
// 						id: '/{-id}',
// 						fullPath: '/{-id}',
// 						path: '{-id}',
// 					}
// 				]
// 			}
// 		})
// 		const oldFindMatch = (path: string) => {
// 			for (const route of flatRoutes) {
// 				const params = matchPathname(path, { to: route.fullPath })
// 				if (params) return { route, params }
// 			}
// 			return null
// 		}
// 		expect(oldFindMatch('/')?.route.id).toMatchInlineSnapshot(`"__root__"`)
// 	})
// })

describe('findRouteMatch', () => {
  describe('priority', () => {
    it('/static/optional vs /static/dynamic', () => {
      const tree = makeTree(['/foo/{-$id}', '/foo/$id'])
      expect(findRouteMatch('/foo/123', tree)?.route.id).toBe('/foo/$id')
    })
    it('/static/optional/static vs /static/dynamic/static', () => {
      const tree = makeTree(['/a/{-$b}/c', '/a/$b/c'])
      expect(findRouteMatch('/a/b/c', tree)?.route.id).toBe('/a/$b/c')
    })
    it('/static/optional/dynamic vs /static/dynamic/static', () => {
      const tree = makeTree(['/a/{-$b}/$c', '/a/$b/c'])
      expect(findRouteMatch('/a/b/c', tree)?.route.id).toBe('/a/$b/c')
    })
    it('/static/optional/static vs /static/dynamic', () => {
      const tree = makeTree(['/users/{-$org}/settings', '/users/$id'])
      expect(findRouteMatch('/users/settings', tree)?.route.id).toBe(
        '/users/{-$org}/settings',
      )
    })
    it('/optional/static/static vs /static/dynamic', () => {
      const tree = makeTree(['/{-$other}/posts/new', '/posts/$id'])
      expect(findRouteMatch('/posts/new', tree)?.route.id).toBe(
        '/{-$other}/posts/new',
      )
    })
    it('/optional/static/static vs /static/static', () => {
      const tree = makeTree(['/{-$other}/posts/new', '/posts/new'])
      expect(findRouteMatch('/posts/new', tree)?.route.id).toBe('/posts/new')
    })
    it('/optional/static/static/dynamic vs /static/dynamic/static/dynamic', () => {
      const tree = makeTree(['/{-$other}/posts/a/b/$c', '/posts/$a/b/$c'])
      expect(findRouteMatch('/posts/a/b/c', tree)?.route.id).toBe(
        '/{-$other}/posts/a/b/$c',
      )
    })
    it('?? is this what we want?', () => {
      const tree = makeTree(['/{-$a}/{-$b}/{-$c}/d/e', '/$a/$b/c/d/$e'])
      expect(findRouteMatch('/a/b/c/d/e', tree)?.route.id).toBe('/$a/$b/c/d/$e')
    })
    it('?? is this what we want?', () => {
      const tree = makeTree(['/$a/$b/$c/d/e', '/$a/$b/c/d/$e'])
      expect(findRouteMatch('/a/b/c/d/e', tree)?.route.id).toBe('/$a/$b/c/d/$e')
    })
  })

  describe('not found', () => {
    it('returns null when no match is found', () => {
      const tree = makeTree(['/a/b/c', '/d/e/f'])
      expect(findRouteMatch('/x/y/z', tree)).toBeNull()
    })
    it('returns something w/ fuzzy matching enabled', () => {
      const tree = makeTree(['/a/b/c', '/d/e/f'])
      const match = findRouteMatch('/x/y/z', tree, true)
      expect(match?.route?.id).toBe('__root__')
      expect(match?.params).toMatchInlineSnapshot(`
        {
          "**": "/x/y/z",
        }
      `)
    })
  })

  describe('case sensitivity competition', () => {
    it('a case sensitive segment early on should not prevent a case insensitive match', () => {
      const tree = {
        id: '__root__',
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/Foo',
            fullPath: '/Foo',
            path: 'Foo',
            options: { caseSensitive: false },
            children: [
              {
                id: '/Foo/a',
                fullPath: '/Foo/a',
                path: '/a',
              },
            ],
          },
          {
            id: '/foo',
            fullPath: '/foo',
            path: 'foo',
            options: { caseSensitive: true },
            children: [
              {
                id: '/foo/b',
                fullPath: '/foo/b',
                path: 'b',
              },
            ],
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      expect(findRouteMatch('/foo/a', processedTree)?.route.id).toBe('/Foo/a')
      expect(findRouteMatch('/foo/b', processedTree)?.route.id).toBe('/foo/b')
    })
    it('a case sensitive segment should have priority over a case insensitive one', () => {
      const tree = {
        id: '__root__',
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/FOO',
            fullPath: '/FOO',
            path: 'FOO',
            options: { caseSensitive: true },
          },
          {
            id: '/foo',
            fullPath: '/foo',
            path: 'foo',
            options: { caseSensitive: false },
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      expect(findRouteMatch('/FOO', processedTree)?.route.id).toBe('/FOO')
      expect(findRouteMatch('/Foo', processedTree)?.route.id).toBe('/foo')
      expect(findRouteMatch('/foo', processedTree)?.route.id).toBe('/foo')
    })
  })

  describe('basic matching', () => {
    it('root', () => {
      const tree = makeTree([])
      expect(findRouteMatch('/', tree)?.route.id).toBe('__root__')
    })
    it('single static', () => {
      const tree = makeTree(['/a'])
      expect(findRouteMatch('/a', tree)?.route.id).toBe('/a')
    })
    it('single dynamic', () => {
      const tree = makeTree(['/$id'])
      expect(findRouteMatch('/123', tree)?.route.id).toBe('/$id')
    })
    it('single optional', () => {
      const tree = makeTree(['/{-$id}'])
      expect(findRouteMatch('/123', tree)?.route.id).toBe('/{-$id}')
      // expect(findRouteMatch('/', tree)?.route.id).toBe('/{-$id}')
      // // ^^^ fails, returns '__root__'
    })
    it('single wildcard', () => {
      const tree = makeTree(['/$'])
      expect(findRouteMatch('/a/b/c', tree)?.route.id).toBe('/$')
    })

    it('dynamic w/ prefix', () => {
      const tree = makeTree(['/{$id}.txt'])
      expect(findRouteMatch('/123.txt', tree)?.route.id).toBe('/{$id}.txt')
    })
    it('dynamic w/ suffix', () => {
      const tree = makeTree(['/file{$id}'])
      expect(findRouteMatch('/file123', tree)?.route.id).toBe('/file{$id}')
    })
    it('dynamic w/ prefix and suffix', () => {
      const tree = makeTree(['/file{$id}.txt'])
      expect(findRouteMatch('/file123.txt', tree)?.route.id).toBe(
        '/file{$id}.txt',
      )
    })
    it('optional w/ prefix', () => {
      const tree = makeTree(['/{-$id}.txt'])
      expect(findRouteMatch('/123.txt', tree)?.route.id).toBe('/{-$id}.txt')
      expect(findRouteMatch('.txt', tree)?.route.id).toBe('/{-$id}.txt')
    })
    it('optional w/ suffix', () => {
      const tree = makeTree(['/file{-$id}'])
      expect(findRouteMatch('/file123', tree)?.route.id).toBe('/file{-$id}')
      expect(findRouteMatch('/file', tree)?.route.id).toBe('/file{-$id}')
    })
    it('optional w/ prefix and suffix', () => {
      const tree = makeTree(['/file{-$id}.txt'])
      expect(findRouteMatch('/file123.txt', tree)?.route.id).toBe(
        '/file{-$id}.txt',
      )
      expect(findRouteMatch('/file.txt', tree)?.route.id).toBe(
        '/file{-$id}.txt',
      )
    })
    it('optional at the end can still be omitted', () => {
      const tree = makeTree(['/a/{-$id}'])
      expect(findRouteMatch('/a', tree)?.route.id).toBe('/a/{-$id}')
    })
    it('multiple optionals at the end can still be omitted', () => {
      const tree = makeTree(['/a/{-$b}/{-$c}/{-$d}'])
      expect(findRouteMatch('/a', tree)?.route.id).toBe('/a/{-$b}/{-$c}/{-$d}')
    })
    it('multiple optionals at the end -> favor earlier segments', () => {
      const tree = makeTree(['/a/{-$b}/{-$c}/{-$d}/{-$e}'])
      expect(findRouteMatch('/a/b/c', tree)?.params).toEqual({ b: 'b', c: 'c' })
    })
    it('wildcard w/ prefix', () => {
      const tree = makeTree(['/file{$}'])
      expect(findRouteMatch('/file/a/b/c', tree)?.route.id).toBe('/file{$}')
    })
    it('wildcard w/ suffix', () => {
      const tree = makeTree(['/{$}/c/file'])
      expect(findRouteMatch('/a/b/c/file', tree)?.route.id).toBe('/{$}/c/file')
    })
    it('wildcard w/ prefix and suffix', () => {
      const tree = makeTree(['/file{$}end'])
      expect(findRouteMatch('/file/a/b/c/end', tree)?.route.id).toBe(
        '/file{$}end',
      )
    })

    it('edge-case: a single required param early on doesnt prevent another match further down', () => {
      const tree = makeTree(['/$one/a/b', '/$two/a/c'])
      expect(findRouteMatch('/1/a/b', tree)?.route.id).toBe('/$one/a/b')
      expect(findRouteMatch('/2/a/c', tree)?.route.id).toBe('/$two/a/c')
    })
    it('edge-case: a single static param early on doesnt prevent another match further down', () => {
      const tree = makeTree(['/x/y/z', '/$id/y/w'])
      expect(findRouteMatch('/x/y/z', tree)?.route.id).toBe('/x/y/z')
      expect(findRouteMatch('/x/y/w', tree)?.route.id).toBe('/$id/y/w')
    })
    it('edge-case: presence of a valid wildcard doesnt prevent other matches', () => {
      const tree = makeTree(['/yo/foo{-$id}bar/ma', '/yo/$'])
      expect(findRouteMatch('/yo/foobar/ma', tree)?.route.id).toBe(
        '/yo/foo{-$id}bar/ma',
      )
      expect(findRouteMatch('/yo/foo123bar/ma', tree)?.route.id).toBe(
        '/yo/foo{-$id}bar/ma',
      )
    })
  })

  describe('nested routes', () => {
    const routeTree = {
      id: '__root__',
      fullPath: '/',
      path: '/',
      children: [
        {
          id: '/a',
          fullPath: '/a',
          path: 'a',
          children: [
            {
              id: '/a/b',
              fullPath: '/a/b',
              path: '/b',
              children: [
                {
                  id: '/a/b/c/d',
                  fullPath: '/a/b/c/d',
                  path: '/c/d',
                },
              ],
            },
          ],
        },
      ],
    }
    const { processedTree } = processRouteTree(routeTree)
    it('matches the deepest route', () => {
      expect(findRouteMatch('/a/b/c/d', processedTree)?.route.id).toBe(
        '/a/b/c/d',
      )
    })
    it('matches an intermediate route', () => {
      expect(findRouteMatch('/a/b', processedTree)?.route.id).toBe('/a/b')
    })
    it('matches the root child route', () => {
      expect(findRouteMatch('/a', processedTree)?.route.id).toBe('/a')
    })
    it('matches the root route', () => {
      expect(findRouteMatch('/', processedTree)?.route.id).toBe('__root__')
    })
    it('does not match a route that doesnt exist', () => {
      expect(findRouteMatch('/a/b/c', processedTree)).toBeNull()
    })
  })

  describe.todo('fuzzy matching', () => {})
})

describe.todo('processFlatRouteList', () => {
  it('processes a route masks list', () => {
    const routeTree = {} as AnyRoute
    const routeMasks: Array<RouteMask<AnyRoute>> = [
      { from: '/a/b/c', routeTree },
      { from: '/a/b/d', routeTree },
      { from: '/a/$param/d', routeTree },
      { from: '/a/{-$optional}/d', routeTree },
      { from: '/a/b/{$}.txt', routeTree },
    ]
    // expect(processFlatRouteList(routeMasks)).toMatchInlineSnapshot()
  })
})
