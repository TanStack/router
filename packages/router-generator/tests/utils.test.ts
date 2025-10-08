import { describe, expect, it, vi } from 'vitest'
import {
  cleanPath,
  determineInitialRoutePath,
  isValidNonNestedRoute,
  mergeImportDeclarations,
  multiSortBy,
  removeExt,
  removeLeadingUnderscores,
  removeTrailingUnderscores,
  removeUnderscores,
  routePathToVariable,
} from '../src/utils'
import type { ImportDeclaration } from '../src/types'

describe('cleanPath', () => {
  it('keeps path with leading slash and trailing slash', () => {
    expect(cleanPath('/test/')).toBe('/test/')
  })
})

describe.each([
  { nonNested: true, mode: 'experimental nonNestedPaths' },
  { nonNested: false, mode: 'default' },
])('determineInitialRoutePath - $mode', ({ nonNested }) => {
  const config = {
    experimental: {
      nonNestedRoutes: nonNested,
    },
    routeToken: 'route',
    indexToken: 'index',
  }

  it('removes dots and adds slashes', () => {
    expect(determineInitialRoutePath('test.test', config)).toStrictEqual({
      routePath: '/test/test',
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/test/test',
    })
  })

  it('keeps leading slash', () => {
    expect(determineInitialRoutePath('/test.test', config)).toStrictEqual({
      routePath: '/test/test',
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/test/test',
    })
  })

  it('keeps trailing slash', () => {
    expect(determineInitialRoutePath('test.test/', config)).toStrictEqual({
      routePath: '/test/test/',
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/test/test/',
    })
  })

  it('removes dots and adds slashes with leading and trailing slashes', () => {
    expect(determineInitialRoutePath('/test.test/', config)).toStrictEqual({
      routePath: '/test/test/',
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/test/test/',
    })
  })

  it("returns '/' if path is empty", () => {
    expect(determineInitialRoutePath('', config)).toStrictEqual({
      routePath: '/',
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/',
    })
  })

  it("returns '/' if path is '.'", () => {
    expect(determineInitialRoutePath('.', config)).toStrictEqual({
      routePath: '/',
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/',
    })
  })

  it("returns '/' if path is './'", () => {
    expect(determineInitialRoutePath('./', config)).toStrictEqual({
      routePath: '/',
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/',
    })
  })

  it('errors on disallowed escaped character', () => {
    const consoleSpy = vi.spyOn(console, 'error')

    expect(() => determineInitialRoutePath('/a[/]', config)).toThrowError()

    expect(consoleSpy).toBeCalledWith(
      'Error: Disallowed character "/" found in square brackets in route path "/a[/]".\n' +
        'You cannot use any of the following characters in square brackets: /, \\, ?, #, :, *, <, >, |, !, $, %\n' +
        'Please remove and/or replace them.',
    )

    consoleSpy.mockRestore()
  })

  it('escapes characters correctly', () => {
    expect(determineInitialRoutePath('/a[.]', config)).toStrictEqual({
      routePath: '/a.',
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/a[.]',
    })

    expect(determineInitialRoutePath('/a[_]', config)).toStrictEqual({
      routePath: '/a_',
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/a[_]',
    })
  })

  // this is changed with experimental non-nested paths.
  // currently trailing underscores are not removed
  // with experimental non-nested paths this is removed to allow escaped '_' to be processed correctly later
  it('should handle trailing underscores correctly', () => {
    expect(determineInitialRoutePath('a_', config)).toStrictEqual({
      routePath: `/a${nonNested ? '' : '_'}`,
      isExperimentalNonNestedRoute: nonNested,
      originalRoutePath: '/a_',
    })

    expect(determineInitialRoutePath('a_.route', config)).toStrictEqual({
      routePath: `/a${nonNested ? '' : '_'}/route`,
      isExperimentalNonNestedRoute: nonNested,
      originalRoutePath: '/a_/route',
    })

    expect(determineInitialRoutePath('a_.b.c', config)).toStrictEqual({
      routePath: `/a${nonNested ? '' : '_'}/b/c`,
      isExperimentalNonNestedRoute: nonNested,
      originalRoutePath: '/a_/b/c',
    })

    expect(determineInitialRoutePath('a.b_.c.d', config)).toStrictEqual({
      routePath: `/a/b${nonNested ? '' : '_'}/c/d`,
      isExperimentalNonNestedRoute: nonNested,
      originalRoutePath: '/a/b_/c/d',
    })

    expect(determineInitialRoutePath('a_.route.b', config)).toStrictEqual({
      routePath: `/a${nonNested ? '' : '_'}/route/b`,
      isExperimentalNonNestedRoute: false,
      originalRoutePath: '/a_/route/b',
    })

    expect(
      determineInitialRoutePath('/a_/_route_/b_/c/d[_]', {
        ...config,
        routeToken: 'route',
      }),
    ).toStrictEqual({
      routePath: `/a${nonNested ? '' : '_'}/_route${nonNested ? '' : '_'}/b${nonNested ? '' : '_'}/c/d_`,
      isExperimentalNonNestedRoute: nonNested,
      originalRoutePath: '/a_/_route_/b_/c/d[_]',
    })

    expect(
      determineInitialRoutePath('/a_/_route_/b_/c/d[_]', {
        ...config,
        routeToken: '_route_',
      }),
    ).toStrictEqual({
      routePath: `/a${nonNested ? '' : '_'}/_route_/b${nonNested ? '' : '_'}/c/d_`,
      isExperimentalNonNestedRoute: nonNested,
      originalRoutePath: '/a_/_route_/b_/c/d[_]',
    })
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

describe('isValidNonNestedRoute', () => {
  const config = {
    experimental: {
      nonNestedRoutes: true,
    },
    routeToken: 'route',
    indexToken: 'index',
  }

  it('should identify valid non-nested routes', () => {
    expect(isValidNonNestedRoute('/a_', config)).toBe(true)
    expect(isValidNonNestedRoute('/a/b_', config)).toBe(true)
    expect(isValidNonNestedRoute('/a_/route', config)).toBe(true)
    expect(isValidNonNestedRoute('/a/route/b_', config)).toBe(true)
    expect(isValidNonNestedRoute('/a_/b', config)).toBe(true)
  })

  it('should identify invalid non-nested routes', () => {
    expect(isValidNonNestedRoute('/a', config)).toBe(false)
    expect(isValidNonNestedRoute('/a/b', config)).toBe(false)
    expect(isValidNonNestedRoute('/a/route/false', config)).toBe(false)
    expect(isValidNonNestedRoute('/a_/route/b', config)).toBe(false)
  })

  it('should return false if not enabled', () => {
    expect(
      isValidNonNestedRoute('/a_', {
        ...config,
        experimental: { nonNestedRoutes: false },
      }),
    ).toBe(false)
  })
})
