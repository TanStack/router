import { describe, expect, it } from 'vitest'
import {
  exactPathTest,
  interpolatePath,
  matchPathname,
  removeBasepath,
  removeTrailingSlash,
  resolvePath,
} from '../src/path'

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
    ])('$name', ({ input, matchingOptions, expectedMatchedParams }) => {
      expect(matchPathname('/', input, matchingOptions)).toStrictEqual(
        expectedMatchedParams,
      )
    })
  })
})
