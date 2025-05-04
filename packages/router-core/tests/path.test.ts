import { describe, expect, it } from 'vitest'
import {
  exactPathTest,
  interpolatePath,
  matchPathname,
  parsePathname,
  removeBasepath,
  removeTrailingSlash,
  resolvePath,
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
    ['/', '/a/b/c', '../d', '/a/b/d'],
    ['/', '/a/b/c', '../../d', '/a/d'],
    ['/', '/a/b/c', '..', '/a/b'],
    ['/', '/a/b/c', '../..', '/a'],
    ['/', '/a/b/c', '../../..', '/'],
    ['/', '/a/b/c/', '../../..', '/'],
    ['/products', '/', '/products-list', '/products/products-list'],
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
})

describe('interpolatePath', () => {
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
    {
      name: 'splat param with prefix',
      path: '/prefix$',
      params: { _splat: 'bar' },
      result: '/prefixbar',
    },
    {
      name: 'splat param with suffix',
      path: '/$-suffix',
      params: { _splat: 'bar' },
      result: '/bar-suffix',
    },
    {
      name: 'splat param with prefix and suffix',
      path: '/prefix$-suffix',
      params: { _splat: 'bar' },
      result: '/prefixbar-suffix',
    },
    {
      name: 'named path param with prefix',
      path: '/prefix$bar',
      params: { bar: 'baz' },
      result: '/prefixbaz',
    },
    {
      name: 'named path param with suffix',
      path: '/$foo.suffix',
      params: { foo: 'bar' },
      result: '/bar.suffix',
    },
    {
      name: 'named path param with prefix and suffix',
      path: '/prefix$param.suffix',
      params: { param: 'foobar' },
      result: '/prefixfoobar.suffix',
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
      {
        name: 'splat param with a prefix',
        input: '/docs/prefixbar/baz',
        matchingOptions: {
          to: '/docs/prefix$',
        },
        expectedMatchedParams: {
          '*': 'bar/baz',
          _splat: 'bar/baz',
        },
      },
      {
        name: 'splat param with a suffix',
        input: '/docs/bar/baz.suffix',
        matchingOptions: {
          to: '/docs/$.suffix',
        },
        expectedMatchedParams: {
          '*': 'bar/baz',
          _splat: 'bar/baz',
        },
      },
      {
        name: 'splat param with a prefix and suffix',
        input: '/docs/prefixbar/baz-suffix',
        matchingOptions: {
          to: '/docs/prefix$-suffix',
        },
        expectedMatchedParams: {
          '*': 'bar/baz',
          _splat: 'bar/baz',
        },
      },
      {
        name: 'named path param with a prefix',
        input: '/docs/prefixfoo',
        matchingOptions: {
          to: '/docs/prefix$bar',
        },
        expectedMatchedParams: {
          bar: 'baz',
        },
      },
      {
        name: 'named path param with a suffix',
        input: '/docs/foo.suffix',
        matchingOptions: {
          to: '/docs/$bar.suffix',
        },
        expectedMatchedParams: {
          bar: 'foo',
        },
      },
      {
        name: 'named path param with a prefix and suffix',
        input: '/docs/prefixfoobar-suffix',
        matchingOptions: {
          to: '/docs/prefix$param-suffix',
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
  it.each([
    {
      name: 'should handle pathname being undefined',
      pathname: undefined,
      expected: [],
    },
    {
      name: 'should handle pathname being empty',
      pathname: '',
      expected: [],
    },
    {
      name: 'should handle pathname at root',
      pathname: '/',
      expected: [{ type: 'pathname', value: '/' }],
    },
    {
      name: 'should handle pathname with a single segment',
      pathname: '/foo',
      expected: [
        { type: 'pathname', value: '/' },
        { type: 'pathname', value: 'foo' },
      ],
    },
    {
      name: 'should handle pathname with multiple segments',
      pathname: '/foo/bar/baz',
      expected: [
        { type: 'pathname', value: '/' },
        { type: 'pathname', value: 'foo' },
        { type: 'pathname', value: 'bar' },
        { type: 'pathname', value: 'baz' },
      ],
    },
    {
      name: 'should handle pathname with a trailing slash',
      pathname: '/foo/',
      expected: [
        { type: 'pathname', value: '/' },
        { type: 'pathname', value: 'foo' },
        { type: 'pathname', value: '/' },
      ],
    },
    {
      name: 'should handle named params',
      pathname: '/foo/$bar',
      expected: [
        { type: 'pathname', value: '/' },
        { type: 'pathname', value: 'foo' },
        { type: 'param', value: '$bar' },
      ],
    },
    {
      name: 'should handle named params at the root',
      pathname: '/$bar',
      expected: [
        { type: 'pathname', value: '/' },
        { type: 'param', value: '$bar' },
      ],
    },
    {
      name: 'should handle named params followed by a segment',
      pathname: '/foo/$bar/baz',
      expected: [
        { type: 'pathname', value: '/' },
        { type: 'pathname', value: 'foo' },
        { type: 'param', value: '$bar' },
        { type: 'pathname', value: 'baz' },
      ],
    },
    {
      name: 'should handle multiple named params',
      pathname: '/foo/$bar/$baz/qux/$quux',
      expected: [
        { type: 'pathname', value: '/' },
        { type: 'pathname', value: 'foo' },
        { type: 'param', value: '$bar' },
        { type: 'param', value: '$baz' },
        { type: 'pathname', value: 'qux' },
        { type: 'param', value: '$quux' },
      ],
    },
    {
      name: 'should handle splat params',
      pathname: '/foo/$',
      expected: [
        { type: 'pathname', value: '/' },
        { type: 'pathname', value: 'foo' },
        { type: 'wildcard', value: '$' },
      ],
    },
    {
      name: 'should handle splat params at the root',
      pathname: '/$',
      expected: [
        { type: 'pathname', value: '/' },
        { type: 'wildcard', value: '$' },
      ],
    },
    {
      name: 'should handle named path param with a prefix',
      pathname: '/foo$',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'wildcard',
          value: '$',
          prefixSegment: 'foo',
        },
      ],
    },
    {
      name: 'should handle named path param with a prefix followed by a special character',
      pathname: '/foo.$',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'wildcard',
          value: '$',
          prefixSegment: 'foo.',
        },
      ],
    },
    {
      name: 'should handle named path param with a prefix followed by a special character and a segment',
      pathname: '/foo.$/bar',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'wildcard',
          value: '$',
          prefixSegment: 'foo.',
        },
        { type: 'pathname', value: 'bar' },
      ],
    },
    {
      name: 'should handle named path param with a suffix',
      pathname: '/$bar.foo',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'param',
          value: '$bar',
          suffixSegment: '.foo',
        },
      ],
    },
    {
      name: 'should handle named path param with a suffix started by a special character',
      pathname: '/$bar.foo',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'param',
          value: '$bar',
          suffixSegment: '.foo',
        },
      ],
    },
    {
      name: 'should handle named path param with a suffix started by a special character and a segment',
      pathname: '/$bar.foo/baz',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'param',
          value: '$bar',
          suffixSegment: '.foo',
        },
        { type: 'pathname', value: 'baz' },
      ],
    },
    {
      name: 'should handle named path param with a suffix and a prefix',
      pathname: '/foo$bar.baz',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'param',
          value: '$bar',
          prefixSegment: 'foo',
          suffixSegment: '.baz',
        },
      ],
    },
    {
      name: 'should handle splat param with a prefix',
      pathname: '/foo$',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'wildcard',
          value: '$',
          prefixSegment: 'foo',
        },
      ],
    },
    {
      name: 'should handle splat param with a prefix followed by a special character',
      pathname: '/foo.$',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'wildcard',
          value: '$',
          prefixSegment: 'foo.',
        },
      ],
    },
    {
      name: 'should handle splat param with a suffix',
      pathname: '/$-foo',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'wildcard',
          value: '$',
          suffixSegment: '-foo',
        },
      ],
    },
    {
      name: 'should handle splat params with a suffix and a prefix',
      pathname: '/foo$-bar',
      expected: [
        { type: 'pathname', value: '/' },
        {
          type: 'wildcard',
          value: '$',
          prefixSegment: 'foo',
          suffixSegment: '-bar',
        },
      ],
    },
  ] satisfies Array<{
    name: string
    pathname: string | undefined
    expected: Array<PathSegment>
  }>)('$name', ({ pathname, expected }) => {
    const result = parsePathname(pathname)
    expect(result).toEqual(expected)
  })
})
