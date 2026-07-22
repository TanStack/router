import { describe, expect, it } from 'vitest'
import { interpolatePath } from '../src/path'
import {
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_VARIADIC,
  findRouteMatch,
  parseSegment,
  processRouteTree,
} from '../src/new-process-route-tree'

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

describe('Variadic Path Parameters', () => {
  describe('parseSegment', () => {
    it('parses {...$param} as a variadic segment', () => {
      const path = '/{...$folders}'
      const data = parseSegment(path, 1)
      expect(data[0]).toBe(SEGMENT_TYPE_VARIADIC)
      expect(path.substring(data[2], data[3])).toBe('folders')
    })

    it('treats {...$} (missing name) as a static segment', () => {
      const path = '/{...$}'
      const data = parseSegment(path, 1)
      expect(data[0]).toBe(SEGMENT_TYPE_PATHNAME)
    })

    it('treats {.$param} and {..$param} (too few dots) as static segments', () => {
      for (const path of ['/{.$folders}', '/{..$folders}']) {
        const data = parseSegment(path, 1)
        expect(data[0]).toBe(SEGMENT_TYPE_PATHNAME)
      }
    })
  })

  describe('invariants', () => {
    it('rejects a prefix or suffix on a variadic segment', () => {
      expect(() => makeTree(['/files/pre{...$path}/end'])).toThrow(
        /prefix or suffix/,
      )
      expect(() => makeTree(['/files/{...$path}post/end'])).toThrow(
        /prefix or suffix/,
      )
    })

    it('rejects adjacent variadic segments', () => {
      expect(() => makeTree(['/{...$a}/{...$b}'])).toThrow(
        /separated by a static segment/,
      )
    })

    it('rejects variadic segments separated only by a param', () => {
      expect(() => makeTree(['/{...$a}/$x/{...$b}'])).toThrow(
        /separated by a static segment/,
      )
    })

    it('rejects a wildcard separated from a variadic only by a param', () => {
      expect(() => makeTree(['/files/{...$path}/$x/$'])).toThrow(
        /wildcard cannot follow a variadic/,
      )
    })

    it('rejects more than three variadic segments in one route path', () => {
      expect(() =>
        makeTree(['/{...$v1}/a/{...$v2}/b/{...$v3}/c/{...$v4}']),
      ).toThrow(/at most 3/)
    })

    it('accepts three variadic segments in one route path', () => {
      const tree = makeTree(['/{...$v1}/a/{...$v2}/b/{...$v3}'])
      expect(findRouteMatch('/x/a/y/b/z', tree)?.rawParams).toEqual({
        v1: ['x'],
        v2: ['y'],
        v3: ['z'],
      })
    })

    it('rejects a wildcard immediately after a variadic', () => {
      expect(() => makeTree(['/files/{...$path}/$'])).toThrow(
        /wildcard cannot follow a variadic/,
      )
    })

    it('rejects a wildcard separated from a variadic only by optionals', () => {
      expect(() => makeTree(['/files/{...$path}/{-$x}/$'])).toThrow(
        /wildcard cannot follow a variadic/,
      )
    })

    it('rejects an adjacent variadic across route levels', () => {
      expect(() =>
        processRouteTree({
          id: '__root__',
          isRoot: true,
          fullPath: '/',
          path: '/',
          children: [
            {
              id: 'parent',
              fullPath: '/{...$a}',
              path: '{...$a}',
              children: [
                {
                  id: 'child',
                  fullPath: '/{...$a}/{...$b}',
                  path: '{...$b}',
                },
              ],
            },
          ],
        }),
      ).toThrow(/separated by a static segment/)
    })
  })

  describe('matching', () => {
    it('matches zero segments', () => {
      const tree = makeTree(['/files/{...$path}/preview'])
      const match = findRouteMatch('/files/preview', tree)
      expect(match?.route.id).toBe('/files/{...$path}/preview')
      expect(match?.rawParams).toEqual({ path: [] })
    })

    it('matches one and many segments', () => {
      const tree = makeTree(['/$bucket/{...$folders}/$file'])
      expect(findRouteMatch('/media/kyoto.jpg', tree)?.rawParams).toEqual({
        bucket: 'media',
        folders: [],
        file: 'kyoto.jpg',
      })
      expect(
        findRouteMatch('/media/photos/kyoto.jpg', tree)?.rawParams,
      ).toEqual({
        bucket: 'media',
        folders: ['photos'],
        file: 'kyoto.jpg',
      })
      expect(
        findRouteMatch('/media/photos/2026/raw/kyoto.jpg', tree)?.rawParams,
      ).toEqual({
        bucket: 'media',
        folders: ['photos', '2026', 'raw'],
        file: 'kyoto.jpg',
      })
    })

    it('matches a variable-depth folder path with a trailing surface', () => {
      const tree = makeTree([
        '/$bucket/{...$folders}/$file/versions/$versionId',
        '/$bucket/{...$folders}/$file',
      ])
      const match = findRouteMatch(
        '/media/photos/2026/kyoto.jpg/versions/42',
        tree,
      )
      expect(match?.route.id).toBe(
        '/$bucket/{...$folders}/$file/versions/$versionId',
      )
      expect(match?.rawParams).toEqual({
        bucket: 'media',
        folders: ['photos', '2026'],
        file: 'kyoto.jpg',
        versionId: '42',
      })
    })

    it('decodes each consumed segment independently', () => {
      const tree = makeTree(['/files/{...$path}/x'])
      const match = findRouteMatch('/files/a%2Fb/c/x', tree)
      expect(match?.rawParams).toEqual({ path: ['a/b', 'c'] })
    })

    it('composes with a terminal wildcard in the same route path', () => {
      const tree = makeTree(['/$bucket/{...$folders}/$file/blob/$'])
      const match = findRouteMatch(
        '/media/photos/2026/album/blob/src/main.rs',
        tree,
      )
      expect(match?.rawParams).toEqual({
        bucket: 'media',
        folders: ['photos', '2026'],
        file: 'album',
        _splat: 'src/main.rs',
        '*': 'src/main.rs',
      })
      expect(
        findRouteMatch('/media/album/blob/README.md', tree)?.rawParams,
      ).toEqual({
        bucket: 'media',
        folders: [],
        file: 'album',
        _splat: 'README.md',
        '*': 'README.md',
      })
    })

    it('binds the whole path on a leaf variadic', () => {
      const tree = makeTree(['/tree/{...$all}'])
      expect(findRouteMatch('/tree/a/b/c', tree)?.rawParams).toEqual({
        all: ['a', 'b', 'c'],
      })
      expect(findRouteMatch('/tree', tree)?.rawParams).toEqual({ all: [] })
    })

    it('consumes up to 131071 segments', () => {
      const tree = makeTree(['/tree/{...$all}/end'])
      const segments = Array.from({ length: 131071 }, (_, i) => `s${i}`)
      const match = findRouteMatch(`/tree/${segments.join('/')}/end`, tree)
      expect(match?.rawParams).toEqual({ all: segments })
    })

    it('does not match when a variadic would need to consume more than 131071 segments', () => {
      const tree = makeTree(['/tree/{...$all}/end'])
      const segments = Array.from({ length: 131072 }, (_, i) => `s${i}`)
      expect(findRouteMatch(`/tree/${segments.join('/')}/end`, tree)).toBe(null)
    })
  })

  describe('multiple variadics', () => {
    it('matches variadics separated by a static segment at every depth combination', () => {
      const tree = makeTree(['/{...$a}/mid/{...$b}'])
      expect(findRouteMatch('/mid', tree)?.rawParams).toEqual({ a: [], b: [] })
      expect(findRouteMatch('/x/y/mid', tree)?.rawParams).toEqual({
        a: ['x', 'y'],
        b: [],
      })
      expect(findRouteMatch('/mid/x/y', tree)?.rawParams).toEqual({
        a: [],
        b: ['x', 'y'],
      })
      expect(findRouteMatch('/x/mid/y/z', tree)?.rawParams).toEqual({
        a: ['x'],
        b: ['y', 'z'],
      })
    })

    it('anchors on the first separator occurrence when it repeats', () => {
      const tree = makeTree(['/{...$a}/mid/{...$b}'])
      expect(findRouteMatch('/x/mid/y/mid/z', tree)?.rawParams).toEqual({
        a: ['x'],
        b: ['y', 'mid', 'z'],
      })
    })

    it('composes across route levels with a static between', () => {
      const tree = processRouteTree({
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: 'parent',
            fullPath: '/{...$a}',
            path: '{...$a}',
            children: [
              {
                id: 'child',
                fullPath: '/{...$a}/x/{...$b}',
                path: 'x/{...$b}',
              },
            ],
          },
        ],
      }).processedTree
      expect(findRouteMatch('/p/x/q', tree)?.rawParams).toEqual({
        a: ['p'],
        b: ['q'],
      })
    })

    it('interpolates and round-trips two arrays', () => {
      const path = '/{...$a}/mid/{...$b}'
      const params = { a: ['x'], b: ['y', 'z'] }
      const { interpolatedPath } = interpolatePath({ path, params })
      expect(interpolatedPath).toBe('/x/mid/y/z')
      const tree = makeTree([path])
      expect(findRouteMatch(interpolatedPath, tree)?.rawParams).toEqual(params)
    })

    it('keeps a zero-segment variadic in usedParams', () => {
      const { interpolatedPath, usedParams } = interpolatePath({
        path: '/$bucket/{...$folders}/$file',
        params: { bucket: 'media', folders: [], file: 'kyoto.jpg' },
      })
      expect(interpolatedPath).toBe('/media/kyoto.jpg')
      expect(usedParams).toEqual({
        bucket: 'media',
        folders: [],
        file: 'kyoto.jpg',
      })
    })
  })

  describe('ranking', () => {
    it('static segments beat variadic consumption', () => {
      const tree = makeTree(['/docs/{...$rest}/end', '/docs/guide/end'])
      expect(findRouteMatch('/docs/guide/end', tree)?.route.id).toBe(
        '/docs/guide/end',
      )
      expect(findRouteMatch('/docs/other/end', tree)?.route.id).toBe(
        '/docs/{...$rest}/end',
      )
    })

    it('required params beat variadic consumption', () => {
      const tree = makeTree(['/docs/{...$rest}/end', '/docs/$section/end'])
      const match = findRouteMatch('/docs/guide/end', tree)
      expect(match?.route.id).toBe('/docs/$section/end')
    })

    it('optional params beat variadic consumption', () => {
      const tree = makeTree(['/docs/{...$rest}/end', '/docs/{-$section}/end'])
      expect(findRouteMatch('/docs/guide/end', tree)?.route.id).toBe(
        '/docs/{-$section}/end',
      )
    })

    it('variadic beats the terminal wildcard', () => {
      const tree = makeTree(['/docs/$', '/docs/{...$rest}/edit'])
      expect(findRouteMatch('/docs/a/b/edit', tree)?.route.id).toBe(
        '/docs/{...$rest}/edit',
      )
      // no /edit tail: only the wildcard can match
      expect(findRouteMatch('/docs/a/b', tree)?.route.id).toBe('/docs/$')
    })

    it('consumes as few segments as possible when the continuation allows both', () => {
      const tree = makeTree(['/{...$dirs}/{-$x}/$leaf'])
      const match = findRouteMatch('/a/b', tree)
      expect(match?.rawParams).toEqual({ dirs: [], x: 'a', leaf: 'b' })
    })
  })

  describe('params.parse interplay', () => {
    it('passes the array value to params.parse and honors rejection', () => {
      const seen: Array<unknown> = []
      const routeTree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: 'guarded',
            fullPath: '/v/{...$dirs}/$leaf',
            path: 'v/{...$dirs}/$leaf',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  seen.push(params)
                  return (params.dirs as unknown as Array<string>).length <= 1
                },
              },
            },
          },
          {
            id: 'fallback',
            fullPath: '/v/$',
            path: 'v/$',
          },
        ],
      }
      const { processedTree } = processRouteTree(routeTree)

      const ok = findRouteMatch('/v/photos/kyoto.jpg', processedTree)
      expect(ok?.route.id).toBe('guarded')
      expect(ok?.rawParams).toEqual({ dirs: ['photos'], leaf: 'kyoto.jpg' })

      // parse rejects depth 2 -> falls through to the wildcard route
      const rejected = findRouteMatch('/v/a/b/kyoto.jpg', processedTree)
      expect(rejected?.route.id).toBe('fallback')
      expect(seen.some((p) => Array.isArray((p as any).dirs))).toBe(true)
    })
  })

  describe('interpolatePath', () => {
    it('joins array values with slashes, encoding each segment', () => {
      const result = interpolatePath({
        path: '/$bucket/{...$folders}/$file',
        params: {
          bucket: 'media',
          folders: ['photos', 'a/b'],
          file: 'kyoto.jpg',
        },
      })
      expect(result.interpolatedPath).toBe('/media/photos/a%2Fb/kyoto.jpg')
      expect(result.isMissingParams).toBe(false)
    })

    it('omits the segment for an empty or absent variadic', () => {
      expect(
        interpolatePath({
          path: '/$bucket/{...$folders}/$file',
          params: { bucket: 'media', folders: [], file: 'kyoto.jpg' },
        }).interpolatedPath,
      ).toBe('/media/kyoto.jpg')
      const absent = interpolatePath({
        path: '/$bucket/{...$folders}/$file',
        params: { bucket: 'media', file: 'kyoto.jpg' },
      })
      expect(absent.interpolatedPath).toBe('/media/kyoto.jpg')
      expect(absent.isMissingParams).toBe(false)
    })

    it('round-trips with matching', () => {
      const tree = makeTree([
        '/$bucket/{...$folders}/$file/versions/$versionId',
      ])
      const params = {
        bucket: 'media',
        folders: ['photos', '2026'],
        file: 'kyoto.jpg',
        versionId: '42',
      }
      const { interpolatedPath } = interpolatePath({
        path: '/$bucket/{...$folders}/$file/versions/$versionId',
        params,
      })
      expect(interpolatedPath).toBe('/media/photos/2026/kyoto.jpg/versions/42')
      expect(findRouteMatch(interpolatedPath, tree)?.rawParams).toEqual(params)
    })
  })
})
