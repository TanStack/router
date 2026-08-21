import { describe, expect, it } from 'vitest'
import {
  findFlatMatch,
  findRouteMatch,
  findSingleMatch,
  processRouteMasks,
  processRouteTree,
} from '../src/new-process-route-tree'
import { decodePath } from '../src/string-encoding'
import { interpolatePath } from '../src/path'
import type { RouteMask } from '../src'

function makeTree(routes: Array<string>) {
  return processRouteTree({
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    path: '/',
    children: routes.map((route) => ({
      id: route,
      fullPath: `/${route}`,
      path: route,
    })),
  })
}

function makeMaskedTree(from: string) {
  const routeTree = {
    id: '__root__',
    isRoot: true,
    fullPath: '/',
  } as any
  const processedTree = makeTree(['$id']).processedTree
  const routeMasks = [
    { from, to: '/$id' },
    { from, routeTree },
  ] as Array<RouteMask<any>>
  processRouteMasks(routeMasks, processedTree)
  return processedTree
}

describe('malformed percent-encoding in paths', () => {
  // These inputs previously caused `URIError` to escape `extractParams` via
  // `findFlatMatch` (route masks) and `findSingleMatch` (`router.matchRoute`),
  // which had no guard. `findRouteMatch` caught them and returned null (404);
  // that is now the uniform behavior for every entry point.
  const malformedPaths = [
    '/post/%E4%BD', // truncated multi-byte sequence
    '/post/%zz', // non-hex sequence
    '/post/%', // bare percent
    '/%ED%A0%80', // UTF-8 encoded surrogate
  ]

  it.each(malformedPaths)('findRouteMatch does not throw for %s', (path) => {
    const { processedTree } = makeTree(['$id', 'files/*'])
    expect(() => findRouteMatch(path, processedTree)).not.toThrow()
  })

  it.each(malformedPaths)('findRouteMatch treats %s as no match', (path) => {
    const { processedTree } = makeTree(['$id'])
    expect(findRouteMatch(path, processedTree)).toBeNull()
  })

  it.each(malformedPaths)(
    'findFlatMatch does not throw for %s (route masks)',
    (path) => {
      const processedTree = makeMaskedTree('/to/$id')
      // note: `decodePath` leaves malformed sequences intact, so this is what
      // mask matching would see in production for such a URL
      expect(() =>
        findFlatMatch(path.replace('/post/', '/to/'), processedTree),
      ).not.toThrow()
    },
  )

  it.each(malformedPaths)(
    'findSingleMatch does not throw for %s (matchRoute)',
    (path) => {
      const single = processRouteTree({ id: 'single', from: '/$id' } as any)
      expect(() =>
        findSingleMatch('/$id', false, false, path, single.processedTree),
      ).not.toThrow()
    },
  )

  it('wildcard routes treat malformed splats as no match instead of crashing', () => {
    const { processedTree } = makeTree(['files/*'])
    expect(findRouteMatch('/files/%E4%BD', processedTree)).toBeNull()
  })

  it('still decodes valid sequences after decodePath, like production matching', () => {
    const { processedTree } = makeTree(['$id'])
    const decoded = decodePath('/caf%C3%A9').path
    const match = findRouteMatch(decoded, processedTree)
    expect(match?.rawParams).toEqual({ id: 'café' })
  })

  it('double-encoded percents still decode one level in params', () => {
    const { processedTree } = makeTree(['$id'])
    // decodePath preserves %25; the matcher decodes it to '%'
    const match = findRouteMatch('/100%25', processedTree)
    expect(match?.rawParams).toEqual({ id: '100%' })
  })

  it('mixed valid and malformed sequences are no match', () => {
    const { processedTree } = makeTree(['$id'])
    expect(findRouteMatch('/a%20b%E4%BD', processedTree)).toBeNull()
  })

  it('fuzzy matching treats malformed splats as no match instead of crashing', () => {
    const { processedTree } = makeTree(['parent'])
    expect(() =>
      findRouteMatch('/parent/child/%E4%BD', processedTree, true),
    ).not.toThrow()
    expect(
      findRouteMatch('/parent/child/%E4%BD', processedTree, true),
    ).toBeNull()
  })
})

describe('known quirk: `*` splat value collides with legacy wildcard syntax', () => {
  it('a splat param of `*` produces a URL that resolves to the legacy wildcard route with no params', () => {
    // This documents current behavior. If this ever gets fixed (e.g. by
    // encoding `*` as `%2A` in splat interpolation), update the property
    // test in string-encoding.property.test.ts accordingly.
    const { interpolatedPath } = interpolatePath({
      path: '/files/$',
      params: { _splat: '*' },
    })
    expect(interpolatedPath).toBe('/files/*')
    const { processedTree } = makeTree(['files/$', 'files/*'])
    const match = findRouteMatch('/files/*', processedTree)
    expect(match?.route.id).toBe('files/*')
    expect(match?.rawParams).toEqual({})
  })
})
