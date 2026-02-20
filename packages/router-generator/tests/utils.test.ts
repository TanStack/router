import { describe, expect, it, vi } from 'vitest'
import {
  RoutePrefixMap,
  cleanPath,
  determineInitialRoutePath,
  hasEscapedLeadingUnderscore,
  hasEscapedTrailingUnderscore,
  inferFullPath,
  isSegmentPathless,
  mergeImportDeclarations,
  multiSortBy,
  removeExt,
  removeLayoutSegmentsWithEscape,
  removeLeadingUnderscores,
  removeTrailingUnderscores,
  removeUnderscores,
  removeUnderscoresWithEscape,
  routePathToVariable,
} from '../src/utils'
import type { ImportDeclaration, RouteNode } from '../src/types'

describe('cleanPath', () => {
  it('keeps path with leading slash and trailing slash', () => {
    expect(cleanPath('/test/')).toBe('/test/')
  })
})

describe('inferFullPath', () => {
  it('returns "/" for pathless layouts under root', () => {
    const node = {
      routePath: '/_layout-a1',
      originalRoutePath: '/_layout-a1',
      cleanedPath: '',
      _fsRouteType: 'pathless_layout',
    } as unknown as RouteNode

    // This avoids inferred fullPath "" which breaks match.fullPath unions
    expect(inferFullPath(node)).toBe('/')
  })
})

describe('determineInitialRoutePath', () => {
  it('removes dots and adds slashes', () => {
    expect(determineInitialRoutePath('test.test')).toStrictEqual({
      routePath: '/test/test',
      originalRoutePath: '/test/test',
    })
  })

  it('keeps leading slash', () => {
    expect(determineInitialRoutePath('/test.test')).toStrictEqual({
      routePath: '/test/test',
      originalRoutePath: '/test/test',
    })
  })

  it('keeps trailing slash', () => {
    expect(determineInitialRoutePath('test.test/')).toStrictEqual({
      routePath: '/test/test/',
      originalRoutePath: '/test/test/',
    })
  })

  it('removes dots and adds slashes with leading and trailing slashes', () => {
    expect(determineInitialRoutePath('/test.test/')).toStrictEqual({
      routePath: '/test/test/',
      originalRoutePath: '/test/test/',
    })
  })

  it("returns '/' if path is empty", () => {
    expect(determineInitialRoutePath('')).toStrictEqual({
      routePath: '/',
      originalRoutePath: '/',
    })
  })

  it("returns '/' if path is '.'", () => {
    expect(determineInitialRoutePath('.')).toStrictEqual({
      routePath: '/',
      originalRoutePath: '/',
    })
  })

  it("returns '/' if path is './'", () => {
    expect(determineInitialRoutePath('./')).toStrictEqual({
      routePath: '/',
      originalRoutePath: '/',
    })
  })

  it('errors on disallowed escaped character', () => {
    const consoleSpy = vi.spyOn(console, 'error')

    expect(() => determineInitialRoutePath('/a[/]')).toThrowError()

    expect(consoleSpy).toBeCalledWith(
      'Error: Disallowed character "/" found in square brackets in route path "/a[/]".\n' +
        'You cannot use any of the following characters in square brackets: /, \\, ?, #, :, *, <, >, |, !, $, %\n' +
        'Please remove and/or replace them.',
    )

    consoleSpy.mockRestore()
  })

  it('escapes characters correctly', () => {
    expect(determineInitialRoutePath('/a[.]')).toStrictEqual({
      routePath: '/a.',
      originalRoutePath: '/a[.]',
    })
  })

  it('should handle trailing underscores correctly', () => {
    expect(determineInitialRoutePath('a_')).toStrictEqual({
      routePath: `/a_`,
      originalRoutePath: '/a_',
    })

    expect(determineInitialRoutePath('a_.route')).toStrictEqual({
      routePath: `/a_/route`,
      originalRoutePath: '/a_/route',
    })

    expect(determineInitialRoutePath('a_.b.c')).toStrictEqual({
      routePath: `/a_/b/c`,
      originalRoutePath: '/a_/b/c',
    })

    expect(determineInitialRoutePath('a.b_.c.d')).toStrictEqual({
      routePath: `/a/b_/c/d`,
      originalRoutePath: '/a/b_/c/d',
    })

    expect(determineInitialRoutePath('a_.route.b')).toStrictEqual({
      routePath: `/a_/route/b`,
      originalRoutePath: '/a_/route/b',
    })
  })
})

describe('multiSortBy', () => {
  it('sorts by single accessor', () => {
    const arr = [{ v: 3 }, { v: 1 }, { v: 2 }]
    const result = multiSortBy(arr, [(d) => d.v])
    expect(result.map((d) => d.v)).toEqual([1, 2, 3])
  })

  it('sorts by multiple accessors', () => {
    const arr = [
      { a: 2, b: 1 },
      { a: 1, b: 2 },
      { a: 1, b: 1 },
    ]
    const result = multiSortBy(arr, [(d) => d.a, (d) => d.b])
    expect(result).toEqual([
      { a: 1, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 1 },
    ])
  })

  it('preserves original order for equal elements', () => {
    const arr = [
      { a: 1, id: 'first' },
      { a: 1, id: 'second' },
      { a: 1, id: 'third' },
    ]
    const result = multiSortBy(arr, [(d) => d.a])
    expect(result.map((d) => d.id)).toEqual(['first', 'second', 'third'])
  })

  it('handles undefined values', () => {
    const arr = [{ v: 1 }, { v: undefined }, { v: 2 }]
    const result = multiSortBy(arr, [(d) => d.v])
    // undefined sorts to end
    expect(result.map((d) => d.v)).toEqual([1, 2, undefined])
  })

  it('handles empty array', () => {
    const result = multiSortBy([], [(d) => d])
    expect(result).toEqual([])
  })

  it('handles single element array', () => {
    const result = multiSortBy([{ v: 1 }], [(d) => d.v])
    expect(result).toEqual([{ v: 1 }])
  })

  it('uses default accessor when none provided', () => {
    const arr = [3, 1, 2]
    const result = multiSortBy(arr)
    expect(result).toEqual([1, 2, 3])
  })

  it('sorts strings correctly', () => {
    const arr = [{ s: 'c' }, { s: 'a' }, { s: 'b' }]
    const result = multiSortBy(arr, [(d) => d.s])
    expect(result.map((d) => d.s)).toEqual(['a', 'b', 'c'])
  })

  it('handles negative numbers in accessors for reverse sort', () => {
    const arr = [{ v: 1 }, { v: 3 }, { v: 2 }]
    const result = multiSortBy(arr, [(d) => -d.v])
    expect(result.map((d) => d.v)).toEqual([3, 2, 1])
  })
})

describe('multiSortBy', () => {
  it('sorts by multiple criteria', () => {
    const data = [
      { routePath: '/test/1/2/index', f: 'b' },
      { routePath: '/test/1', f: 'b' },
      { routePath: '/test/1/2/3/4/index', f: 'b' },
      { routePath: '/test/1/2/3', f: 'b' },
      { routePath: '/test/1/2/3/index', f: 'b' },
      { routePath: '/test/1/2', f: 'b' },
      { routePath: '/test/1/2/3/4', f: 'b' },
    ]

    const sorted = multiSortBy(data, [
      (d) => (d.routePath.includes('1') ? -1 : 1),
      (d) => d.routePath.split('/').length,
      (d) => (d.routePath.endsWith('index') ? -1 : 1),
      (d) => d,
    ])

    expect(sorted).toEqual([
      { routePath: '/test/1', f: 'b' },
      { routePath: '/test/1/2', f: 'b' },
      { routePath: '/test/1/2/index', f: 'b' },
      { routePath: '/test/1/2/3', f: 'b' },
      { routePath: '/test/1/2/3/index', f: 'b' },
      { routePath: '/test/1/2/3/4', f: 'b' },
      { routePath: '/test/1/2/3/4/index', f: 'b' },
    ])
  })
})

describe('removeExt', () => {
  it('removes extension', () => {
    expect(removeExt('test.ts')).toBe('test')
  })

  it('does not remove extension if no extension', () => {
    expect(removeExt('test')).toBe('test')
  })

  it('removes extension with multiple dots', () => {
    expect(removeExt('test.test.ts')).toBe('test.test')
  })

  it('removes extension with leading dot', () => {
    expect(removeExt('.test.ts')).toBe('.test')
  })

  it('removes extension when in a route path', () => {
    expect(removeExt('/test/test.ts')).toBe('/test/test')
  })
})

describe('removeUnderscores', () => {
  it('removes leading underscore', () => {
    expect(removeUnderscores('_test')).toBe('test')
  })

  it('removes trailing underscore', () => {
    expect(removeUnderscores('test_')).toBe('test')
  })

  it('removes leading and trailing underscores', () => {
    expect(removeUnderscores('_test_')).toBe('test')
  })
})

describe('removeLeadingUnderscores', () => {
  it('removes leading underscore when not routeToken', () => {
    expect(removeLeadingUnderscores('_test', 'route')).toBe('test')

    expect(removeLeadingUnderscores('/_test/abc/route/_d', 'route')).toBe(
      '/test/abc/route/d',
    )

    expect(removeLeadingUnderscores('/_test_/abc/_route_/d_/_e', 'route')).toBe(
      '/test_/abc/route_/d_/e',
    )

    expect(
      removeLeadingUnderscores('/_test_/abc/_route_/d_/_e', '_route_'),
    ).toBe('/test_/abc/_route_/d_/e')

    expect(
      removeLeadingUnderscores('/_test_/abc/_route_/d_/_e', 'route_'),
    ).toBe('/test_/abc/route_/d_/e')
  })
})

describe('removeTrailingUnderscores', () => {
  it('removes trailing underscore when not routeToken', () => {
    expect(removeTrailingUnderscores('test_', 'route')).toBe('test')

    expect(removeTrailingUnderscores('/_test_/abc_/route/_d', 'route')).toBe(
      '/_test/abc/route/_d',
    )

    expect(
      removeTrailingUnderscores('/_test_/abc/_route_/d_/_e', 'route'),
    ).toBe('/_test/abc/_route/d/_e')

    expect(
      removeTrailingUnderscores('/_test_/abc/_route_/d_/_e', '_route_'),
    ).toBe('/_test/abc/_route_/d/_e')

    expect(
      removeTrailingUnderscores('/_test_/abc/_route_/d_/_e', '_route'),
    ).toBe('/_test/abc/_route/d/_e')
  })
})

describe('hasEscapedLeadingUnderscore', () => {
  it('returns true for [_] prefix pattern', () => {
    expect(hasEscapedLeadingUnderscore('[_]layout')).toBe(true)
    expect(hasEscapedLeadingUnderscore('[_]foo')).toBe(true)
    expect(hasEscapedLeadingUnderscore('[_]')).toBe(true)
  })

  it('returns true for fully escaped segment starting with underscore', () => {
    expect(hasEscapedLeadingUnderscore('[_layout]')).toBe(true)
    expect(hasEscapedLeadingUnderscore('[_foo]')).toBe(true)
    expect(hasEscapedLeadingUnderscore('[_1nd3x]')).toBe(true)
    expect(hasEscapedLeadingUnderscore('[_]')).toBe(true)
  })

  it('returns false for non-escaped leading underscore', () => {
    expect(hasEscapedLeadingUnderscore('_layout')).toBe(false)
    expect(hasEscapedLeadingUnderscore('_foo')).toBe(false)
  })

  it('returns false for segments without leading underscore', () => {
    expect(hasEscapedLeadingUnderscore('layout')).toBe(false)
    expect(hasEscapedLeadingUnderscore('[layout]')).toBe(false)
    expect(hasEscapedLeadingUnderscore('foo[_]')).toBe(false)
  })

  it('returns false for partial escapes with nested brackets', () => {
    expect(hasEscapedLeadingUnderscore('[_foo[bar]')).toBe(false)
    expect(hasEscapedLeadingUnderscore('[_foo]bar]')).toBe(false)
  })
})

describe('hasEscapedTrailingUnderscore', () => {
  it('returns true for [_] suffix pattern', () => {
    expect(hasEscapedTrailingUnderscore('blog[_]')).toBe(true)
    expect(hasEscapedTrailingUnderscore('foo[_]')).toBe(true)
    expect(hasEscapedTrailingUnderscore('[_]')).toBe(true)
  })

  it('returns true for fully escaped segment ending with underscore', () => {
    expect(hasEscapedTrailingUnderscore('[blog_]')).toBe(true)
    expect(hasEscapedTrailingUnderscore('[foo_]')).toBe(true)
    expect(hasEscapedTrailingUnderscore('[_r0ut3_]')).toBe(true)
    expect(hasEscapedTrailingUnderscore('[_]')).toBe(true)
  })

  it('returns false for non-escaped trailing underscore', () => {
    expect(hasEscapedTrailingUnderscore('blog_')).toBe(false)
    expect(hasEscapedTrailingUnderscore('foo_')).toBe(false)
  })

  it('returns false for segments without trailing underscore', () => {
    expect(hasEscapedTrailingUnderscore('blog')).toBe(false)
    expect(hasEscapedTrailingUnderscore('[blog]')).toBe(false)
    expect(hasEscapedTrailingUnderscore('[_]foo')).toBe(false)
  })

  it('returns false for partial escapes with nested brackets', () => {
    expect(hasEscapedTrailingUnderscore('[foo[bar]_]')).toBe(false)
    expect(hasEscapedTrailingUnderscore('[foo]bar_]')).toBe(false)
  })
})

describe('isSegmentPathless', () => {
  it('returns true for non-escaped leading underscore', () => {
    expect(isSegmentPathless('_layout', '_layout')).toBe(true)
    expect(isSegmentPathless('_foo', '_foo')).toBe(true)
  })

  it('returns false for escaped leading underscore with [_] prefix', () => {
    expect(isSegmentPathless('_layout', '[_]layout')).toBe(false)
    expect(isSegmentPathless('_foo', '[_]foo')).toBe(false)
  })

  it('returns false for fully escaped segment', () => {
    expect(isSegmentPathless('_layout', '[_layout]')).toBe(false)
    expect(isSegmentPathless('_1nd3x', '[_1nd3x]')).toBe(false)
  })

  it('returns false for segments not starting with underscore', () => {
    expect(isSegmentPathless('layout', 'layout')).toBe(false)
    expect(isSegmentPathless('foo', '[foo]')).toBe(false)
  })
})

describe('removeUnderscoresWithEscape', () => {
  it('removes non-escaped leading underscores', () => {
    expect(removeUnderscoresWithEscape('/_layout', '/_layout')).toBe('/layout')
    expect(removeUnderscoresWithEscape('/_foo/_bar', '/_foo/_bar')).toBe(
      '/foo/bar',
    )
  })

  it('removes non-escaped trailing underscores', () => {
    expect(removeUnderscoresWithEscape('/blog_', '/blog_')).toBe('/blog')
    expect(removeUnderscoresWithEscape('/foo_/bar_', '/foo_/bar_')).toBe(
      '/foo/bar',
    )
  })

  it('preserves escaped leading underscores with [_] prefix', () => {
    expect(removeUnderscoresWithEscape('/_layout', '/[_]layout')).toBe(
      '/_layout',
    )
    expect(removeUnderscoresWithEscape('/_foo', '/[_]foo')).toBe('/_foo')
  })

  it('preserves escaped trailing underscores with [_] suffix', () => {
    expect(removeUnderscoresWithEscape('/blog_', '/blog[_]')).toBe('/blog_')
    expect(removeUnderscoresWithEscape('/foo_', '/foo[_]')).toBe('/foo_')
  })

  it('preserves fully escaped segments with underscores', () => {
    expect(removeUnderscoresWithEscape('/_layout', '/[_layout]')).toBe(
      '/_layout',
    )
    expect(removeUnderscoresWithEscape('/_r0ut3_', '/[_r0ut3_]')).toBe(
      '/_r0ut3_',
    )
  })

  it('handles mixed escaped and non-escaped underscores', () => {
    expect(
      removeUnderscoresWithEscape('/_foo/_bar_/baz_', '/_foo/[_]bar_/baz[_]'),
    ).toBe('/foo/_bar/baz_')
  })

  it('falls back to removeUnderscores when no originalPath', () => {
    expect(removeUnderscoresWithEscape('/_foo_')).toBe('/foo')
    expect(removeUnderscoresWithEscape('/_foo_', undefined)).toBe('/foo')
  })

  it('returns empty string for empty/undefined routePath', () => {
    expect(removeUnderscoresWithEscape(undefined)).toBe('')
    expect(removeUnderscoresWithEscape('')).toBe('')
  })
})

describe('removeLayoutSegmentsWithEscape', () => {
  it('removes non-escaped layout segments', () => {
    expect(removeLayoutSegmentsWithEscape('/_layout/foo', '/_layout/foo')).toBe(
      '/foo',
    )
    expect(
      removeLayoutSegmentsWithEscape(
        '/_auth/_admin/dashboard',
        '/_auth/_admin/dashboard',
      ),
    ).toBe('/dashboard')
  })

  it('preserves escaped layout segments with [_] prefix', () => {
    expect(
      removeLayoutSegmentsWithEscape('/_layout/foo', '/[_]layout/foo'),
    ).toBe('/_layout/foo')
    expect(
      removeLayoutSegmentsWithEscape('/_auth/dashboard', '/[_]auth/dashboard'),
    ).toBe('/_auth/dashboard')
  })

  it('preserves fully escaped segments starting with underscore', () => {
    expect(
      removeLayoutSegmentsWithEscape('/_layout/foo', '/[_layout]/foo'),
    ).toBe('/_layout/foo')
    expect(removeLayoutSegmentsWithEscape('/_1nd3x/bar', '/[_1nd3x]/bar')).toBe(
      '/_1nd3x/bar',
    )
  })

  it('handles mixed escaped and non-escaped layout segments', () => {
    expect(
      removeLayoutSegmentsWithEscape(
        '/_auth/_admin/dashboard',
        '/[_]auth/_admin/dashboard',
      ),
    ).toBe('/_auth/dashboard')
    expect(
      removeLayoutSegmentsWithEscape('/_foo/_bar/_baz', '/_foo/[_bar]/_baz'),
    ).toBe('/_bar')
  })

  it('falls back to removeLayoutSegments when no originalPath', () => {
    expect(removeLayoutSegmentsWithEscape('/_foo/bar/_baz')).toBe('/bar')
    expect(removeLayoutSegmentsWithEscape('/_foo/bar/_baz', undefined)).toBe(
      '/bar',
    )
  })

  it('handles root path', () => {
    expect(removeLayoutSegmentsWithEscape('/')).toBe('/')
    expect(removeLayoutSegmentsWithEscape()).toBe('/')
  })
})

describe('routePathToVariable', () => {
  it.each([
    ['/test/$/index', 'TestSplatIndex'],
    ['/test/$', 'TestSplat'],
    ['/test/$/', 'TestSplat'],
    ['/test/index', 'TestIndex'],
    ['/test', 'Test'],
    ['/test/', 'Test'],
    ['/r0ut3', 'R0ut3'],
  ])(`converts "%s" to "%s"`, (routePath, expected) => {
    expect(routePathToVariable(routePath)).toBe(expected)
  })
})

describe('mergeImportDeclarations', () => {
  it('merges imports with the same source but different specifiers', () => {
    const imports: Array<ImportDeclaration> = [
      { source: 'moduleA', specifiers: [{ imported: 'A' }] },
      { source: 'moduleA', specifiers: [{ imported: 'B' }] },
    ]

    const result = mergeImportDeclarations(imports)

    expect(result).toEqual([
      {
        source: 'moduleA',
        specifiers: [{ imported: 'A' }, { imported: 'B' }],
      },
    ])
  })

  it('merges imports with overlapping specifiers', () => {
    const imports: Array<ImportDeclaration> = [
      { source: 'moduleA', specifiers: [{ imported: 'A' }] },
      { source: 'moduleA', specifiers: [{ imported: 'A' }, { imported: 'B' }] },
    ]

    const result = mergeImportDeclarations(imports)

    expect(result).toEqual([
      {
        source: 'moduleA',
        specifiers: [{ imported: 'A' }, { imported: 'B' }],
      },
    ])
  })

  it('does not merge imports with mixed import kinds for the same source', () => {
    const imports: Array<ImportDeclaration> = [
      {
        source: 'moduleA',
        importKind: 'type',
        specifiers: [{ imported: 'A' }],
      },
      { source: 'moduleA', specifiers: [{ imported: 'B' }] },
    ]

    const result = mergeImportDeclarations(imports)

    expect(result).toEqual([
      {
        source: 'moduleA',
        importKind: 'type',
        specifiers: [{ imported: 'A' }],
      },
      { source: 'moduleA', specifiers: [{ imported: 'B' }] },
    ])
  })

  it('removes duplicate specifiers', () => {
    const imports: Array<ImportDeclaration> = [
      { source: 'moduleA', specifiers: [{ imported: 'A' }] },
      { source: 'moduleA', specifiers: [{ imported: 'A' }] },
    ]

    const result = mergeImportDeclarations(imports)

    expect(result).toEqual([
      {
        source: 'moduleA',
        specifiers: [{ imported: 'A' }],
      },
    ])
  })
})

describe('RoutePrefixMap', () => {
  const createRoute = (
    overrides: Partial<RouteNode> & { routePath: string },
  ): RouteNode => ({
    filePath: 'test.tsx',
    fullPath: overrides.routePath,
    variableName: 'Test',
    _fsRouteType: 'static',
    ...overrides,
  })

  describe('constructor', () => {
    it('indexes routes by path', () => {
      const routes = [
        createRoute({ routePath: '/users' }),
        createRoute({ routePath: '/users/profile' }),
      ]
      const map = new RoutePrefixMap(routes)

      expect(map.has('/users')).toBe(true)
      expect(map.has('/users/profile')).toBe(true)
      expect(map.has('/posts')).toBe(false)
    })

    it('skips root path /__root', () => {
      const routes = [createRoute({ routePath: '/__root' })]
      const map = new RoutePrefixMap(routes)

      expect(map.has('/__root')).toBe(false)
    })

    it('skips empty/undefined routePaths', () => {
      const routes = [createRoute({ routePath: '' })]
      const map = new RoutePrefixMap(routes)

      expect(map.has('')).toBe(false)
    })

    it('tracks layout routes separately', () => {
      const routes = [
        createRoute({ routePath: '/app', _fsRouteType: 'layout' }),
        createRoute({ routePath: '/admin', _fsRouteType: 'pathless_layout' }),
        createRoute({ routePath: '/users', _fsRouteType: 'static' }),
      ]
      const map = new RoutePrefixMap(routes)

      // all indexed
      expect(map.has('/app')).toBe(true)
      expect(map.has('/admin')).toBe(true)
      expect(map.has('/users')).toBe(true)
    })
  })

  describe('get', () => {
    it('returns route by exact path', () => {
      const route = createRoute({ routePath: '/users' })
      const map = new RoutePrefixMap([route])

      expect(map.get('/users')).toBe(route)
      expect(map.get('/other')).toBeUndefined()
    })
  })

  describe('findParent', () => {
    it('returns null for root path', () => {
      const map = new RoutePrefixMap([])

      expect(map.findParent('/')).toBeNull()
    })

    it('returns null for empty path', () => {
      const map = new RoutePrefixMap([])

      expect(map.findParent('')).toBeNull()
    })

    it('finds immediate parent', () => {
      const parent = createRoute({ routePath: '/users' })
      const map = new RoutePrefixMap([parent])

      expect(map.findParent('/users/profile')).toBe(parent)
    })

    it('finds ancestor when immediate parent missing', () => {
      const grandparent = createRoute({ routePath: '/users' })
      const map = new RoutePrefixMap([grandparent])

      expect(map.findParent('/users/settings/profile')).toBe(grandparent)
    })

    it('finds closest ancestor with multiple levels', () => {
      const grandparent = createRoute({ routePath: '/users' })
      const parent = createRoute({ routePath: '/users/settings' })
      const map = new RoutePrefixMap([grandparent, parent])

      expect(map.findParent('/users/settings/profile')).toBe(parent)
    })

    it('returns null when no parent exists', () => {
      const map = new RoutePrefixMap([createRoute({ routePath: '/posts' })])

      expect(map.findParent('/users/profile')).toBeNull()
    })

    it('does not return self as parent', () => {
      const route = createRoute({ routePath: '/users' })
      const map = new RoutePrefixMap([route])

      expect(map.findParent('/users')).toBeNull()
    })
  })
})
