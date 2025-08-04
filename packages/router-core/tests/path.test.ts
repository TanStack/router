import { describe, expect, it } from 'vitest'
import {
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  exactPathTest,
  interpolatePath,
  matchPathname,
  parsePathname,
  removeBasepath,
  removeTrailingSlash,
  resolvePath,
  trimPathLeft,
} from '../src/path'
import type { Segment as PathSegment } from '../src/path'

describe('removeBasepath', () => {
  it.each([
    {
      name: '`/` should leave pathname as-is',
      basepath: '/',
      pathname: '/path',
      expected: '/path',
    },
    {
      name: 'should return empty string if basepath is the same as pathname',
      basepath: '/path',
      pathname: '/path',
      expected: '',
    },
    {
      name: 'should remove basepath from the beginning of the pathname',
      basepath: '/app',
      pathname: '/app/path/app',
      expected: '/path/app',
    },
    {
      name: 'should remove multisegment basepath from the beginning of the pathname',
      basepath: '/app/new',
      pathname: '/app/new/path/app/new',
      expected: '/path/app/new',
    },
    {
      name: 'should remove basepath only in case it matches segments completely',
      basepath: '/app',
      pathname: '/application',
      expected: '/application',
    },
    {
      name: 'should remove multisegment basepath only in case it matches segments completely',
      basepath: '/app/new',
      pathname: '/app/new-application',
      expected: '/app/new-application',
    },
  ])('$name', ({ basepath, pathname, expected }) => {
    expect(removeBasepath(basepath, pathname)).toBe(expected)
  })
  describe('case sensitivity', () => {
    describe('caseSensitive = true', () => {
      it.each([
        {
          name: 'should not remove basepath from the beginning of the pathname',
          basepath: '/app',
          pathname: '/App/path/App',
          expected: '/App/path/App',
        },
        {
          name: 'should not remove basepath from the beginning of the pathname with multiple segments',
          basepath: '/app/New',
          pathname: '/App/New/path/App',
          expected: '/App/New/path/App',
        },
      ])('$name', ({ basepath, pathname, expected }) => {
        expect(removeBasepath(basepath, pathname, true)).toBe(expected)
      })
    })

    describe('caseSensitive = false', () => {
      it.each([
        {
          name: 'should remove basepath from the beginning of the pathname',
          basepath: '/App',
          pathname: '/app/path/app',
          expected: '/path/app',
        },
        {
          name: 'should remove multisegment basepath from the beginning of the pathname',
          basepath: '/App/New',
          pathname: '/app/new/path/app',
          expected: '/path/app',
        },
      ])('$name', ({ basepath, pathname, expected }) => {
        expect(removeBasepath(basepath, pathname, false)).toBe(expected)
      })
    })
  })
})

describe.each([{ basepath: '/' }, { basepath: '/app' }, { basepath: '/app/' }])(
  'removeTrailingSlash with basepath $basepath',
  ({ basepath }) => {
    it('should remove trailing slash if present', () => {
      const input = 'https://example.com/'
      const expectedOutput = 'https://example.com'
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(expectedOutput)
    })
    it('should not modify the string if no trailing slash present', () => {
      const input = 'https://example.com'
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(input)
    })
    it('should handle empty string', () => {
      const input = ''
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(input)
    })
    it('should handle strings with only a slash', () => {
      const input = '/'
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(input)
    })
    it('should handle strings with multiple slashes', () => {
      const input = 'https://example.com/path/to/resource/'
      const expectedOutput = 'https://example.com/path/to/resource'
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(expectedOutput)
    })
  },
)

describe.each([{ basepath: '/' }, { basepath: '/app' }, { basepath: '/app/' }])(
  'exactPathTest with basepath $basepath',
  ({ basepath }) => {
    it('should return true when two paths are exactly the same', () => {
      const path1 = 'some-path/additional-path'
      const path2 = 'some-path/additional-path'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(true)
    })
    it('should return true when two paths are the same with or without trailing slash', () => {
      const path1 = 'some-path/additional-path'
      const path2 = 'some-path/additional-path/'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(true)
    })
    it('should return true when two paths are the same with or without trailing slash 2', () => {
      const path1 = 'some-path/additional-path'
      const path2 = 'some-path/additional-path/'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(true)
    })
    it('should return false when two paths are different', () => {
      const path1 = 'some-path/additional-path/'
      const path2 = 'some-path2/additional-path/'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(false)
    })
    it('should return true when both paths are just a slash', () => {
      const path1 = '/'
      const path2 = '/'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(true)
    })
  },
)

describe('resolvePath', () => {
  describe.each([
    ['/', '/', '/', '/'],
    ['/', '/', '/a', '/a'],
    ['/', '/', 'a/', '/a'],
    ['/', '/', '/a/b', '/a/b'],
    ['/', 'a', 'b', '/a/b'],
    ['/a/b', 'c', '/a/b/c', '/a/b/c'],
    ['/a/b', '/', 'c', '/a/b/c'],
    ['/a/b', '/', './c', '/a/b/c'],
    ['/', '/', 'a/b', '/a/b'],
    ['/', '/', './a/b', '/a/b'],
    ['/', '/a/b/c', 'd', '/a/b/c/d'],
    ['/', '/a/b/c', './d', '/a/b/c/d'],
    ['/', '/a/b/c', './../d', '/a/b/d'],
    ['/', '/a/b/c/d', './../d', '/a/b/c/d'],
    ['/', '/a/b/c', '../../d', '/a/d'],
    ['/', '/a/b/c', '../d', '/a/b/d'],
    ['/', '/a/b/c', '..', '/a/b'],
    ['/', '/a/b/c', '../..', '/a'],
    ['/', '/a/b/c', '../../..', '/'],
    ['/', '/a/b/c/', '../../..', '/'],
    ['/products', '/', '/products-list', '/products/products-list'],
    ['/basepath', '/products', '.', '/basepath/products'],
  ])('resolves correctly', (base, a, b, eq) => {
    it(`Base: ${base} - ${a} to ${b} === ${eq}`, () => {
      expect(resolvePath({ basepath: base, base: a, to: b })).toEqual(eq)
    })
    it(`Base: ${base} - ${a}/ to ${b} === ${eq} (trailing slash)`, () => {
      expect(resolvePath({ basepath: base, base: a + '/', to: b })).toEqual(eq)
    })
    it(`Base: ${base} - ${a}/ to ${b}/ === ${eq} (trailing slash + trailing slash)`, () => {
      expect(
        resolvePath({ basepath: base, base: a + '/', to: b + '/' }),
      ).toEqual(eq)
    })
  })
  describe('trailingSlash', () => {
    describe(`'always'`, () => {
      it('keeps trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd/',
            trailingSlash: 'always',
          }),
        ).toBe('/a/b/c/d/')
      })
      it('adds trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd',
            trailingSlash: 'always',
          }),
        ).toBe('/a/b/c/d/')
      })
    })
    describe(`'never'`, () => {
      it('removes trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd/',
            trailingSlash: 'never',
          }),
        ).toBe('/a/b/c/d')
      })
      it('does not add trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd',
            trailingSlash: 'never',
          }),
        ).toBe('/a/b/c/d')
      })
    })
    describe(`'preserve'`, () => {
      it('keeps trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd/',
            trailingSlash: 'preserve',
          }),
        ).toBe('/a/b/c/d/')
      })
      it('does not add trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd',
            trailingSlash: 'preserve',
          }),
        ).toBe('/a/b/c/d')
      })
    })
  })

  describe.each([{ base: '/' }, { base: '/nested' }])(
    'param routes w/ base=$base',
    ({ base }) => {
      describe('wildcard (prefix + suffix)', () => {
        it.each([
          { name: 'regular top-level', to: '/$' },
          { name: 'regular nested', to: '/params/wildcard/$' },
          { name: 'with top-level prefix', to: '/prefix{$}' },
          { name: 'with nested prefix', to: '/params/wildcard/prefix{$}' },
          { name: 'with top-level suffix', to: '/{$}suffix' },
          { name: 'with nested suffix', to: '/params/wildcard/{$}suffix' },
          {
            name: 'with top-level prefix + suffix',
            to: '/prefix{$}suffix',
          },
          {
            name: 'with nested prefix + suffix',
            to: '/params/wildcard/prefix{$}suffix',
          },
        ])('$name', ({ to }) => {
          const candidate = base + trimPathLeft(to)
          expect(
            resolvePath({
              basepath: '/',
              base,
              to: candidate,
              trailingSlash: 'never',
              caseSensitive: false,
            }),
          ).toEqual(candidate)
        })
      })

      describe('named (prefix + suffix)', () => {
        it.each([
          { name: 'regular top-level', to: '/$foo' },
          { name: 'regular nested', to: '/params/named/$foo' },
          { name: 'with top-level prefix', to: '/prefix{$foo}' },
          { name: 'with nested prefix', to: '/params/named/prefix{$foo}' },
          { name: 'with top-level suffix', to: '/{$foo}suffix' },
          { name: 'with nested suffix', to: '/params/named/{$foo}suffix' },
          {
            name: 'with top-level prefix + suffix',
            to: '/prefix{$foo}suffix',
          },
          {
            name: 'with nested prefix + suffix',
            to: '/params/named/prefix{$foo}suffix',
          },
        ])('$name', ({ to }) => {
          const candidate = base + trimPathLeft(to)
          expect(
            resolvePath({
              basepath: '/',
              base,
              to: candidate,
              trailingSlash: 'never',
              caseSensitive: false,
            }),
          ).toEqual(candidate)
        })
      })
    },
  )
})

describe('interpolatePath', () => {
  describe('regular usage', () => {
    it.each([
      {
        name: 'should interpolate the path',
        path: '/users/$id',
        params: { id: '123' },
        result: '/users/123',
      },
      {
        name: 'should interpolate the path with multiple params',
        path: '/users/$id/$name',
        params: { id: '123', name: 'tanner' },
        result: '/users/123/tanner',
      },
      {
        name: 'should interpolate the path with extra params',
        path: '/users/$id',
        params: { id: '123', name: 'tanner' },
        result: '/users/123',
      },
      {
        name: 'should interpolate the path with missing params',
        path: '/users/$id/$name',
        params: { id: '123' },
        result: '/users/123/undefined',
      },
      {
        name: 'should interpolate the path with missing params and extra params',
        path: '/users/$id',
        params: { name: 'john' },
        result: '/users/undefined',
      },
      {
        name: 'should interpolate the path with the param being a number',
        path: '/users/$id',
        params: { id: 123 },
        result: '/users/123',
      },
      {
        name: 'should interpolate the path with the param being a falsey number',
        path: '/users/$id',
        params: { id: 0 },
        result: '/users/0',
      },
      {
        name: 'should interpolate the path with URI component encoding',
        path: '/users/$id',
        params: { id: '?#@john+smith' },
        result: '/users/%3F%23%40john%2Bsmith',
      },
      {
        name: 'should interpolate the path without URI encoding characters in decodeCharMap',
        path: '/users/$id',
        params: { id: '?#@john+smith' },
        result: '/users/%3F%23@john+smith',
        decodeCharMap: new Map(
          ['@', '+'].map((char) => [encodeURIComponent(char), char]),
        ),
      },
      {
        name: 'should interpolate the path with the splat param at the end',
        path: '/users/$',
        params: { _splat: '123' },
        result: '/users/123',
      },
      {
        name: 'should interpolate the path with a single named path param and the splat param at the end',
        path: '/users/$username/$',
        params: { username: 'seancassiere', _splat: '123' },
        result: '/users/seancassiere/123',
      },
      {
        name: 'should interpolate the path with 2 named path params with the splat param at the end',
        path: '/users/$username/$id/$',
        params: { username: 'seancassiere', id: '123', _splat: '456' },
        result: '/users/seancassiere/123/456',
      },
      {
        name: 'should interpolate the path with multiple named path params with the splat param at the end',
        path: '/$username/settings/$repo/$id/$',
        params: {
          username: 'sean-cassiere',
          repo: 'my-repo',
          id: '123',
          _splat: '456',
        },
        result: '/sean-cassiere/settings/my-repo/123/456',
      },
      {
        name: 'should interpolate the path with the splat param containing slashes',
        path: '/users/$',
        params: { _splat: 'sean/cassiere' },
        result: '/users/sean/cassiere',
      },
    ])('$name', ({ path, params, decodeCharMap, result }) => {
      expect(
        interpolatePath({
          path,
          params,
          decodeCharMap,
        }).interpolatedPath,
      ).toBe(result)
    })
  })

  describe('wildcard (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        to: '/$',
        params: { _splat: 'bar/foo/me' },
        result: '/bar/foo/me',
      },
      {
        name: 'regular curly braces',
        to: '/{$}',
        params: { _splat: 'bar/foo/me' },
        result: '/bar/foo/me',
      },
      {
        name: 'with prefix',
        to: '/prefix{$}',
        params: { _splat: 'bar' },
        result: '/prefixbar',
      },
      {
        name: 'with suffix',
        to: '/{$}-suffix',
        params: { _splat: 'bar' },
        result: '/bar-suffix',
      },
      {
        name: 'with prefix + suffix',
        to: '/prefix{$}-suffix',
        params: { _splat: 'bar' },
        result: '/prefixbar-suffix',
      },
    ])('$name', ({ to, params, result }) => {
      expect(
        interpolatePath({
          path: to,
          params,
        }).interpolatedPath,
      ).toBe(result)
    })
  })

  describe('named params (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        to: '/$foo',
        params: { foo: 'bar' },
        result: '/bar',
      },
      {
        name: 'regular curly braces',
        to: '/{$foo}',
        params: { foo: 'bar' },
        result: '/bar',
      },
      {
        name: 'with prefix',
        to: '/prefix{$bar}',
        params: { bar: 'baz' },
        result: '/prefixbaz',
      },
      {
        name: 'with suffix',
        to: '/{$foo}.suffix',
        params: { foo: 'bar' },
        result: '/bar.suffix',
      },
      {
        name: 'with prefix and suffix',
        to: '/prefix{$param}.suffix',
        params: { param: 'foobar' },
        result: '/prefixfoobar.suffix',
      },
    ])('$name', ({ to, params, result }) => {
      expect(
        interpolatePath({
          path: to,
          params,
        }).interpolatedPath,
      ).toBe(result)
    })
  })

  describe('should handle missing _splat parameter for', () => {
    it.each([
      {
        name: 'basic splat route',
        path: '/hello/$',
        params: {},
        expectedResult: '/hello',
      },
      {
        name: 'splat route with prefix',
        path: '/hello/prefix{$}',
        params: {},
        expectedResult: '/hello/prefix',
      },
      {
        name: 'splat route with suffix',
        path: '/hello/{$}suffix',
        params: {},
        expectedResult: '/hello/suffix',
      },
      {
        name: 'splat route with prefix and suffix',
        path: '/hello/prefix{$}suffix',
        params: {},
        expectedResult: '/hello/prefixsuffix',
      },
      {
        name: 'nested splat route',
        path: '/users/$id/$',
        params: { id: '123' },
        expectedResult: '/users/123',
      },
    ])('$name', ({ path, params, expectedResult }) => {
      const result = interpolatePath({
        path,
        params,
      })
      expect(result.interpolatedPath).toBe(expectedResult)
      expect(result.isMissingParams).toBe(true)
    })
  })
})

describe('matchPathname', () => {
  describe('basepath matching', () => {
    it.each([
      {
        name: 'should match when the input is the same as the basepath',
        basepath: '/basepath',
        input: '/basepath',
        matchingOptions: {
          to: '/',
        },
        expectedMatchedParams: {},
      },
      {
        name: 'should match when the input starts with the basepath and `to` is set to the remaining',
        basepath: '/basepath',
        input: '/basepath/abc',
        matchingOptions: {
          to: '/abc',
        },
        expectedMatchedParams: {},
      },
      {
        name: 'should not match when the input is `/` and does not start with the basepath',
        basepath: '/basepath',
        input: '/',
        matchingOptions: {
          to: '/',
        },
        expectedMatchedParams: undefined,
      },
      {
        name: 'should not match when the input completely does not start with the basepath',
        basepath: '/basepath',
        input: '/abc',
        matchingOptions: {
          to: '/abc',
        },
        expectedMatchedParams: undefined,
      },
      {
        name: 'should not match when the input only partially matches the basepath',
        basepath: '/base',
        input: '/basepath/abc',
        matchingOptions: {
          to: '/abc',
        },
        expectedMatchedParams: undefined,
      },
    ])(
      '$name',
      ({ basepath, input, matchingOptions, expectedMatchedParams }) => {
        expect(matchPathname(basepath, input, matchingOptions)).toStrictEqual(
          expectedMatchedParams,
        )
      },
    )
  })

  describe('path param(s) matching', () => {
    it.each([
      {
        name: 'should not match since `to` does not match the input',
        input: '/',
        matchingOptions: {
          to: '/users',
        },
        expectedMatchedParams: undefined,
      },
      {
        name: 'should match since `to` matches the input',
        input: '/users',
        matchingOptions: {
          to: '/users',
        },
        expectedMatchedParams: {},
      },
      {
        name: 'should match and return the named path params',
        input: '/users/123',
        matchingOptions: {
          to: '/users/$id',
        },
        expectedMatchedParams: { id: '123' },
      },
      {
        name: 'should match and return the the splat param',
        input: '/users/123',
        matchingOptions: {
          to: '/users/$',
        },
        expectedMatchedParams: {
          '*': '123',
          _splat: '123',
        },
      },
      {
        name: 'should match and return the named path and splat params',
        input: '/users/123/456',
        matchingOptions: {
          to: '/users/$id/$',
        },
        expectedMatchedParams: {
          id: '123',
          '*': '456',
          _splat: '456',
        },
      },
      {
        name: 'should match and return the multiple named path params and splat param',
        input: '/sean-cassiere/settings/my-repo/123/456',
        matchingOptions: {
          to: '/$username/settings/$repo/$id/$',
        },
        expectedMatchedParams: {
          username: 'sean-cassiere',
          repo: 'my-repo',
          id: '123',
          '*': '456',
          _splat: '456',
        },
      },
      {
        name: 'should match and return the splat params when multiple subsequent segments are present',
        input: '/docs/tanner/sean/manuel',
        matchingOptions: {
          to: '/docs/$',
        },
        expectedMatchedParams: {
          '*': 'tanner/sean/manuel',
          _splat: 'tanner/sean/manuel',
        },
      },
    ])('$name', ({ input, matchingOptions, expectedMatchedParams }) => {
      expect(matchPathname('/', input, matchingOptions)).toStrictEqual(
        expectedMatchedParams,
      )
    })
  })

  describe('wildcard (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        input: '/docs/foo/bar',
        matchingOptions: {
          to: '/docs/$',
        },
        expectedMatchedParams: {
          '*': 'foo/bar',
          _splat: 'foo/bar',
        },
      },
      {
        name: 'regular curly braces',
        input: '/docs/foo/bar',
        matchingOptions: {
          to: '/docs/{$}',
        },
        expectedMatchedParams: {
          '*': 'foo/bar',
          _splat: 'foo/bar',
        },
      },
      {
        name: 'with prefix',
        input: '/docs/prefixbar/baz',
        matchingOptions: {
          to: '/docs/prefix{$}',
        },
        expectedMatchedParams: {
          '*': 'bar/baz',
          _splat: 'bar/baz',
        },
      },
      {
        name: 'with suffix',
        input: '/docs/bar/baz.suffix',
        matchingOptions: {
          to: '/docs/{$}.suffix',
        },
        expectedMatchedParams: {
          '*': 'bar/baz',
          _splat: 'bar/baz',
        },
      },
      {
        name: 'with prefix + suffix',
        input: '/docs/prefixbar/baz-suffix',
        matchingOptions: {
          to: '/docs/prefix{$}-suffix',
        },
        expectedMatchedParams: {
          '*': 'bar/baz',
          _splat: 'bar/baz',
        },
      },
    ])('$name', ({ input, matchingOptions, expectedMatchedParams }) => {
      expect(matchPathname('/', input, matchingOptions)).toStrictEqual(
        expectedMatchedParams,
      )
    })
  })

  describe('named params (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        input: '/docs/foo',
        matchingOptions: {
          to: '/docs/$bar',
        },
        expectedMatchedParams: {
          bar: 'foo',
        },
      },
      {
        name: 'regular curly braces',
        input: '/docs/foo',
        matchingOptions: {
          to: '/docs/{$bar}',
        },
        expectedMatchedParams: {
          bar: 'foo',
        },
      },
      {
        name: 'with prefix',
        input: '/docs/prefixfoo',
        matchingOptions: {
          to: '/docs/prefix{$bar}',
        },
        expectedMatchedParams: {
          bar: 'foo',
        },
      },
      {
        name: 'with suffix',
        input: '/docs/foo.suffix',
        matchingOptions: {
          to: '/docs/{$bar}.suffix',
        },
        expectedMatchedParams: {
          bar: 'foo',
        },
      },
      {
        name: 'with prefix + suffix',
        input: '/docs/prefixfoobar-suffix',
        matchingOptions: {
          to: '/docs/prefix{$param}-suffix',
        },
        expectedMatchedParams: {
          param: 'foobar',
        },
      },
    ])('$name', ({ input, matchingOptions, expectedMatchedParams }) => {
      expect(matchPathname('/', input, matchingOptions)).toStrictEqual(
        expectedMatchedParams,
      )
    })
  })
})

describe('parsePathname', () => {
  type ParsePathnameTestScheme = Array<{
    name: string
    to: string | undefined
    expected: Array<PathSegment>
  }>

  describe('regular usage', () => {
    it.each([
      {
        name: 'should handle pathname being undefined',
        to: undefined,
        expected: [],
      },
      {
        name: 'should handle pathname being empty',
        to: '',
        expected: [],
      },
      {
        name: 'should handle pathname at root',
        to: '/',
        expected: [{ type: SEGMENT_TYPE_PATHNAME, value: '/' }],
      },
      {
        name: 'should handle pathname with a single segment',
        to: '/foo',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
        ],
      },
      {
        name: 'should handle pathname with multiple segments',
        to: '/foo/bar/baz',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'bar' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'baz' },
        ],
      },
      {
        name: 'should handle pathname with a trailing slash',
        to: '/foo/',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
        ],
      },
      {
        name: 'should handle named params',
        to: '/foo/$bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_PARAM, value: '$bar' },
        ],
      },
      {
        name: 'should handle named params at the root',
        to: '/$bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PARAM, value: '$bar' },
        ],
      },
      {
        name: 'should handle named params followed by a segment',
        to: '/foo/$bar/baz',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_PARAM, value: '$bar' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'baz' },
        ],
      },
      {
        name: 'should handle multiple named params',
        to: '/foo/$bar/$baz/qux/$quux',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_PARAM, value: '$bar' },
          { type: SEGMENT_TYPE_PARAM, value: '$baz' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'qux' },
          { type: SEGMENT_TYPE_PARAM, value: '$quux' },
        ],
      },
      {
        name: 'should handle splat params',
        to: '/foo/$',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_WILDCARD, value: '$' },
        ],
      },
      {
        name: 'should handle splat params at the root',
        to: '/$',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_WILDCARD, value: '$' },
        ],
      },
    ] satisfies ParsePathnameTestScheme)('$name', ({ to, expected }) => {
      const result = parsePathname(to)
      expect(result).toEqual(expected)
    })
  })

  describe('wildcard (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        to: '/$',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_WILDCARD, value: '$' },
        ],
      },
      {
        name: 'regular curly braces',
        to: '/{$}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_WILDCARD, value: '$' },
        ],
      },
      {
        name: 'with prefix (regular text)',
        to: '/foo{$}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            prefixSegment: 'foo',
          },
        ],
      },
      {
        name: 'with prefix + followed by special character',
        to: '/foo.{$}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            prefixSegment: 'foo.',
          },
        ],
      },
      {
        name: 'with suffix',
        to: '/{$}-foo',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            suffixSegment: '-foo',
          },
        ],
      },
      {
        name: 'with prefix + suffix',
        to: '/foo{$}-bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            prefixSegment: 'foo',
            suffixSegment: '-bar',
          },
        ],
      },
      {
        name: 'with prefix + followed by special character and a segment',
        to: '/foo.{$}/bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            prefixSegment: 'foo.',
          },
          { type: SEGMENT_TYPE_PATHNAME, value: 'bar' },
        ],
      },
    ] satisfies ParsePathnameTestScheme)('$name', ({ to, expected }) => {
      const result = parsePathname(to)
      expect(result).toEqual(expected)
    })
  })

  describe('named params (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        to: '/$bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PARAM, value: '$bar' },
        ],
      },
      {
        name: 'regular curly braces',
        to: '/{$bar}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          { type: SEGMENT_TYPE_PARAM, value: '$bar' },
        ],
      },
      {
        name: 'with prefix (regular text)',
        to: '/foo{$bar}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: '$bar',
            prefixSegment: 'foo',
          },
        ],
      },
      {
        name: 'with prefix + followed by special character',
        to: '/foo.{$bar}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: '$bar',
            prefixSegment: 'foo.',
          },
        ],
      },
      {
        name: 'with suffix',
        to: '/{$bar}.foo',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: '$bar',
            suffixSegment: '.foo',
          },
        ],
      },
      {
        name: 'with suffix + started by special character',
        to: '/{$bar}.foo',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: '$bar',
            suffixSegment: '.foo',
          },
        ],
      },
      {
        name: 'with suffix + started by special character and followed by segment',
        to: '/{$bar}.foo/baz',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: '$bar',
            suffixSegment: '.foo',
          },
          { type: SEGMENT_TYPE_PATHNAME, value: 'baz' },
        ],
      },
      {
        name: 'with suffix + prefix',
        to: '/foo{$bar}.baz',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '/' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: '$bar',
            prefixSegment: 'foo',
            suffixSegment: '.baz',
          },
        ],
      },
    ] satisfies ParsePathnameTestScheme)('$name', ({ to, expected }) => {
      const result = parsePathname(to)
      expect(result).toEqual(expected)
    })
  })
})
