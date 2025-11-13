import { describe, expect, it } from 'vitest'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'
import type { AnyRoute, RouteMask } from '../src'

// import { createLRUCache } from '../src/lru-cache'
// import { processRouteTree as oldProcessRouteTree } from './old-process-route-tree'
// import { matchPathname } from './old-path'
// import big from '../src/Untitled-4.json'

function makeTree(routes: Array<string>) {
  return processRouteTree({
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    path: '/',
    children: routes.map((route) => ({
      id: route,
      fullPath: route,
      path: route,
    })),
  }).processedTree
}

describe('findRouteMatch', () => {
  describe('priority', () => {
    describe('basic permutations priorities', () => {
      it('/static/static vs /static/dynamic', () => {
        const tree = makeTree(['/a/b', '/a/$b'])
        expect(findRouteMatch('/a/b', tree)?.route.id).toBe('/a/b')
      })
      it('/static/static vs /static/optional', () => {
        const tree = makeTree(['/a/b', '/a/{-$b}'])
        expect(findRouteMatch('/a/b', tree)?.route.id).toBe('/a/b')
      })
      it('/static/static vs /static/wildcard', () => {
        const tree = makeTree(['/a/b', '/a/$'])
        expect(findRouteMatch('/a/b', tree)?.route.id).toBe('/a/b')
      })
      it('/static/dynamic vs /static/optional', () => {
        const tree = makeTree(['/a/$b', '/a/{-$b}'])
        expect(findRouteMatch('/a/b', tree)?.route.id).toBe('/a/$b')
      })
      it('/static/dynamic vs /static/wildcard', () => {
        const tree = makeTree(['/a/$b', '/a/$'])
        expect(findRouteMatch('/a/b', tree)?.route.id).toBe('/a/$b')
      })
      it('/static/optional vs /static/wildcard', () => {
        const tree = makeTree(['/a/{-$b}', '/a/$'])
        expect(findRouteMatch('/a/b', tree)?.route.id).toBe('/a/{-$b}')
      })
    })

    describe('prefix / suffix priorities', () => {
      it('prefix+suffix dynamic wins over plain dynamic', () => {
        const tree = makeTree(['/a/b{$b}b', '/a/$b'])
        expect(findRouteMatch('/a/bbb', tree)?.route.id).toBe('/a/b{$b}b')
      })
      it('prefix dynamic wins over plain dynamic', () => {
        const tree = makeTree(['/a/b{$b}', '/a/$b'])
        expect(findRouteMatch('/a/bbb', tree)?.route.id).toBe('/a/b{$b}')
      })
      it('suffix dynamic wins over plain dynamic', () => {
        const tree = makeTree(['/a/{$b}b', '/a/$b'])
        expect(findRouteMatch('/a/bbb', tree)?.route.id).toBe('/a/{$b}b')
      })

      it('prefix+suffix optional wins over plain optional', () => {
        const tree = makeTree(['/a/b{-$b}b', '/a/{-$b}'])
        expect(findRouteMatch('/a/bbb', tree)?.route.id).toBe('/a/b{-$b}b')
      })
      it('prefix optional wins over plain optional', () => {
        const tree = makeTree(['/a/b{-$b}', '/a/{-$b}'])
        expect(findRouteMatch('/a/bbb', tree)?.route.id).toBe('/a/b{-$b}')
      })
      it('suffix optional wins over plain optional', () => {
        const tree = makeTree(['/a/{-$b}b', '/a/{-$b}'])
        expect(findRouteMatch('/a/bbb', tree)?.route.id).toBe('/a/{-$b}b')
      })

      it('prefix+suffix wildcard wins over plain wildcard', () => {
        const tree = makeTree(['/a/b{$}b', '/a/$'])
        expect(findRouteMatch('/a/bbb', tree)?.route.id).toBe('/a/b{$}b')
      })
      it('prefix wildcard wins over plain wildcard', () => {
        const tree = makeTree(['/a/b{$}', '/a/$'])
        expect(findRouteMatch('/a/bbb', tree)?.route.id).toBe('/a/b{$}')
      })
      it('suffix wildcard wins over plain wildcard', () => {
        const tree = makeTree(['/a/{$}b', '/a/$'])
        expect(findRouteMatch('/a/bbb', tree)?.route.id).toBe('/a/{$}b')
      })
    })

    describe('prefix / suffix lengths', () => {
      it('longer overlapping prefix wins over shorter prefix', () => {
        const tree = makeTree(['/a/b{$b}', '/a/bbbb{$b}'])
        expect(findRouteMatch('/a/bbbbb', tree)?.route.id).toBe('/a/bbbb{$b}')
      })
      it('longer overlapping suffix wins over shorter suffix', () => {
        const tree = makeTree(['/a/{$b}b', '/a/{$b}bbbb'])
        expect(findRouteMatch('/a/bbbbb', tree)?.route.id).toBe('/a/{$b}bbbb')
      })
      it('longer prefix and shorter suffix wins over shorter prefix and longer suffix', () => {
        const tree = makeTree(['/a/b{$b}bbb', '/a/bbb{$b}b'])
        expect(findRouteMatch('/a/bbbbb', tree)?.route.id).toBe('/a/bbb{$b}b')
      })
    })

    describe('root matches', () => {
      it('optional at the root matches /', () => {
        const tree = makeTree(['/{-$id}'])
        const res = findRouteMatch('/', tree)
        expect(res?.route.id).toBe('/{-$id}')
        expect(res?.params).toEqual({})
      })
      it('wildcard at the root matches /', () => {
        const tree = makeTree(['/$'])
        const res = findRouteMatch('/', tree)
        expect(res?.route.id).toBe('/$')
        expect(res?.params).toEqual({ '*': '', _splat: '' })
      })
      it('dynamic at the root DOES NOT match /', () => {
        const tree = makeTree(['/$id'])
        const res = findRouteMatch('/', tree)
        expect(res).toBeNull()
      })
    })

    describe('edge-case variations', () => {
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
      it('chain of optional and static segments: favor earlier static segments', () => {
        const tree = makeTree([
          '/{-$a}/{-$b}/{-$c}/d/e',
          '/{-$a}/{-$b}/c/d/{-$e}',
        ])
        expect(findRouteMatch('/a/b/c/d/e', tree)?.route.id).toBe(
          '/{-$a}/{-$b}/c/d/{-$e}',
        )
      })
      it('chain of dynamic and static segments: favor earlier static segments', () => {
        const tree = makeTree(['/$a/$b/$c/d/e', '/$a/$b/c/d/$e'])
        expect(findRouteMatch('/a/b/c/d/e', tree)?.route.id).toBe(
          '/$a/$b/c/d/$e',
        )
      })
    })
  })

  describe('not found', () => {
    it('returns null when no match is found', () => {
      const tree = makeTree(['/', '/a/b/c', '/d/e/f'])
      expect(findRouteMatch('/x/y/z', tree)).toBeNull()
    })
    it('returns something w/ fuzzy matching enabled', () => {
      const tree = makeTree(['/', '/a/b/c', '/d/e/f'])
      const match = findRouteMatch('/x/y/z', tree, true)
      expect(match?.route?.id).toBe('/')
      expect(match?.params).toMatchInlineSnapshot(`
        {
          "**": "x/y/z",
        }
      `)
    })
  })

  describe.todo('trailing slashes', () => {})

  describe('case sensitivity competition', () => {
    it('a case sensitive segment early on should not prevent a case insensitive match', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
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
        isRoot: true,
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
    it('a case sensitive prefix/suffix should have priority over a case insensitive one', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/aa{$id}bb',
            fullPath: '/aa{$id}bb',
            path: 'aa{$id}bb',
            options: { caseSensitive: false },
          },
          {
            id: '/A{$id}B',
            fullPath: '/A{$id}B',
            path: 'A{$id}B',
            options: { caseSensitive: true },
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      expect(findRouteMatch('/AfooB', processedTree)?.route.id).toBe('/A{$id}B')
      expect(findRouteMatch('/AAABBB', processedTree)?.route.id).toBe(
        '/A{$id}B',
      )
    })
  })

  describe('basic matching', () => {
    it('root itself cannot match', () => {
      const tree = makeTree([])
      expect(findRouteMatch('/', tree)).toBeNull()
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
      expect(findRouteMatch('/', tree)?.route.id).toBe('/{-$id}')
    })
    it('single wildcard', () => {
      const tree = makeTree(['/$'])
      expect(findRouteMatch('/a/b/c', tree)?.route.id).toBe('/$')
    })

    describe('prefix / suffix variations', () => {
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
        expect(findRouteMatch('/.txt', tree)?.route.id).toBe('/{-$id}.txt')
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
    it('optional and wildcard at the end can still be omitted', () => {
      const tree = makeTree(['/a/{-$id}/$'])
      const result = findRouteMatch('/a', tree)
      expect(result?.route.id).toBe('/a/{-$id}/$')
      expect(result?.params).toEqual({ '*': '', _splat: '' })
    })
    it('multi-segment wildcard w/ prefix', () => {
      const tree = makeTree(['/file{$}'])
      expect(findRouteMatch('/file/a/b/c', tree)?.route.id).toBe('/file{$}')
    })
    it('multi-segment wildcard w/ suffix', () => {
      const tree = makeTree(['/{$}/c/file'])
      expect(findRouteMatch('/a/b/c/file', tree)?.route.id).toBe('/{$}/c/file')
    })
    it('multi-segment wildcard w/ prefix and suffix', () => {
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
      const absent = findRouteMatch('/yo/foobar/ma', tree)
      expect(absent?.route.id).toBe('/yo/foo{-$id}bar/ma')
      const present = findRouteMatch('/yo/foo123bar/ma', tree)
      expect(present?.route.id).toBe('/yo/foo{-$id}bar/ma')
    })
    it('edge-case: ???', () => {
      // This test comes from the previous processRouteTree tests.
      // > This demonstrates that `/foo/{-$p}.tsx` will be matched, not `/foo/{-$p}/{-$x}.tsx`
      // > This route has 1 optional parameter, making it more specific than the route with 2
      const tree = makeTree(['/foo/{-$p}.tsx', '/foo/{-$p}/{-$x}.tsx'])
      expect(findRouteMatch('/foo', tree)?.route.id).toBe('/foo/{-$p}.tsx')
      expect(findRouteMatch('/foo/bar.tsx', tree)?.route.id).toBe(
        '/foo/{-$p}.tsx',
      )
    })
  })

  describe('nested routes', () => {
    const routeTree = {
      id: '__root__',
      isRoot: true,
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
    it('nothing can match the root route', () => {
      expect(findRouteMatch('/', processedTree)).toBeNull()
    })
    it('does not match a route that doesnt exist', () => {
      expect(findRouteMatch('/a/b/c', processedTree)).toBeNull()
    })
  })

  describe.todo('fuzzy matching', () => {})
})

describe.todo('processRouteMasks', () => {
  it('processes a route masks list', () => {
    const routeTree = {} as AnyRoute
    const routeMasks: Array<RouteMask<AnyRoute>> = [
      { from: '/a/b/c', routeTree },
      { from: '/a/b/d', routeTree },
      { from: '/a/$param/d', routeTree },
      { from: '/a/{-$optional}/d', routeTree },
      { from: '/a/b/{$}.txt', routeTree },
    ]
    // expect(processRouteMasks(routeMasks)).toMatchInlineSnapshot()
  })
})
