import { describe, expect, it } from 'vitest'
import { interpolatePath, matchPathname, parsePathname } from '../src/path'
import type { Segment as PathSegment } from '../src/path'

describe('Optional Path Parameters', () => {
  type ParsePathnameTestScheme = Array<{
    name: string
    to: string | undefined
    expected: Array<PathSegment>
  }>

  describe('parsePathname with optional params', () => {
    it.each([
      {
        name: 'regular optional param',
        to: '/{-$slug}',
        expected: [
          { type: 'pathname', value: '/' },
          { type: 'optional-param', value: '$slug' },
        ],
      },
      {
        name: 'optional param with prefix',
        to: '/prefix{-$slug}',
        expected: [
          { type: 'pathname', value: '/' },
          {
            type: 'optional-param',
            value: '$slug',
            prefixSegment: 'prefix',
          },
        ],
      },
      {
        name: 'optional param with suffix',
        to: '/{-$slug}suffix',
        expected: [
          { type: 'pathname', value: '/' },
          {
            type: 'optional-param',
            value: '$slug',
            suffixSegment: 'suffix',
          },
        ],
      },
      {
        name: 'optional param with prefix and suffix',
        to: '/prefix{-$slug}suffix',
        expected: [
          { type: 'pathname', value: '/' },
          {
            type: 'optional-param',
            value: '$slug',
            prefixSegment: 'prefix',
            suffixSegment: 'suffix',
          },
        ],
      },
      {
        name: 'multiple optional params',
        to: '/posts/{-$category}/{-$slug}',
        expected: [
          { type: 'pathname', value: '/' },
          { type: 'pathname', value: 'posts' },
          { type: 'optional-param', value: '$category' },
          { type: 'optional-param', value: '$slug' },
        ],
      },
      {
        name: 'mixed required and optional params',
        to: '/users/$id/{-$tab}',
        expected: [
          { type: 'pathname', value: '/' },
          { type: 'pathname', value: 'users' },
          { type: 'param', value: '$id' },
          { type: 'optional-param', value: '$tab' },
        ],
      },
      {
        name: 'optional param followed by required param',
        to: '/{-$category}/$slug',
        expected: [
          { type: 'pathname', value: '/' },
          { type: 'optional-param', value: '$category' },
          { type: 'param', value: '$slug' },
        ],
      },
      {
        name: 'optional param with wildcard',
        to: '/docs/{-$version}/$',
        expected: [
          { type: 'pathname', value: '/' },
          { type: 'pathname', value: 'docs' },
          { type: 'optional-param', value: '$version' },
          { type: 'wildcard', value: '$' },
        ],
      },
      {
        name: 'complex path with all param types',
        to: '/api/{-$version}/users/$id/{-$tab}/$',
        expected: [
          { type: 'pathname', value: '/' },
          { type: 'pathname', value: 'api' },
          { type: 'optional-param', value: '$version' },
          { type: 'pathname', value: 'users' },
          { type: 'param', value: '$id' },
          { type: 'optional-param', value: '$tab' },
          { type: 'wildcard', value: '$' },
        ],
      },
      {
        name: 'optional param at root',
        to: '/{-$slug}',
        expected: [
          { type: 'pathname', value: '/' },
          { type: 'optional-param', value: '$slug' },
        ],
      },
      {
        name: 'multiple consecutive optional params',
        to: '/{-$year}/{-$month}/{-$day}',
        expected: [
          { type: 'pathname', value: '/' },
          { type: 'optional-param', value: '$year' },
          { type: 'optional-param', value: '$month' },
          { type: 'optional-param', value: '$day' },
        ],
      },
    ] satisfies ParsePathnameTestScheme)('$name', ({ to, expected }) => {
      const result = parsePathname(to)
      expect(result).toEqual(expected)
    })
  })

  describe('interpolatePath with optional params', () => {
    it.each([
      {
        name: 'optional param provided',
        path: '/posts/{-$category}',
        params: { category: 'tech' },
        result: '/posts/tech',
      },
      {
        name: 'optional param omitted',
        path: '/posts/{-$category}',
        params: {},
        result: '/posts',
      },
      {
        name: 'optional param with undefined value',
        path: '/posts/{-$category}',
        params: { category: undefined },
        result: '/posts',
      },
      {
        name: 'optional param with prefix - provided',
        path: '/posts/prefix{-$category}',
        params: { category: 'tech' },
        result: '/posts/prefixtech',
      },
      {
        name: 'optional param with prefix - omitted',
        path: '/posts/prefix{-$category}',
        params: {},
        result: '/posts/prefix',
      },
      {
        name: 'optional param with suffix - provided',
        path: '/posts/{-$category}.html',
        params: { category: 'tech' },
        result: '/posts/tech.html',
      },
      {
        name: 'optional param with suffix - omitted',
        path: '/posts/{-$category}.html',
        params: {},
        result: '/posts/.html',
      },
      {
        name: 'optional param with prefix and suffix - provided',
        path: '/posts/prefix{-$category}suffix',
        params: { category: 'tech' },
        result: '/posts/prefixtechsuffix',
      },
      {
        name: 'optional param with prefix and suffix - omitted',
        path: '/posts/prefix{-$category}suffix',
        params: {},
        result: '/posts/prefixsuffix',
      },
      {
        name: 'multiple optional params - all provided',
        path: '/posts/{-$category}/{-$slug}',
        params: { category: 'tech', slug: 'hello-world' },
        result: '/posts/tech/hello-world',
      },
      {
        name: 'multiple optional params - partially provided',
        path: '/posts/{-$category}/{-$slug}',
        params: { category: 'tech' },
        result: '/posts/tech',
      },
      {
        name: 'multiple optional params - none provided',
        path: '/posts/{-$category}/{-$slug}',
        params: {},
        result: '/posts',
      },
      {
        name: 'mixed required and optional params - all provided',
        path: '/users/$id/{-$tab}',
        params: { id: '123', tab: 'settings' },
        result: '/users/123/settings',
      },
      {
        name: 'mixed required and optional params - optional omitted',
        path: '/users/$id/{-$tab}',
        params: { id: '123' },
        result: '/users/123',
      },
      {
        name: 'optional param between required params',
        path: '/users/$id/{-$section}/edit',
        params: { id: '123', section: 'profile' },
        result: '/users/123/profile/edit',
      },
      {
        name: 'optional param between required params - omitted',
        path: '/users/$id/{-$section}/edit',
        params: { id: '123' },
        result: '/users/123/edit',
      },
      {
        name: 'complex path with all param types - all provided',
        path: '/api/{-$version}/users/$id/{-$tab}/$',
        params: {
          version: 'v2',
          id: '123',
          tab: 'settings',
          _splat: 'extra/path',
        },
        result: '/api/v2/users/123/settings/extra/path',
      },
      {
        name: 'complex path with all param types - optionals omitted',
        path: '/api/{-$version}/users/$id/{-$tab}/$',
        params: { id: '123', _splat: 'extra/path' },
        result: '/api/users/123/extra/path',
      },
      {
        name: 'multiple consecutive optional params - all provided',
        path: '/{-$year}/{-$month}/{-$day}',
        params: { year: '2023', month: '12', day: '25' },
        result: '/2023/12/25',
      },
      {
        name: 'multiple consecutive optional params - partially provided',
        path: '/{-$year}/{-$month}/{-$day}',
        params: { year: '2023', month: '12' },
        result: '/2023/12',
      },
      {
        name: 'multiple consecutive optional params - first only',
        path: '/{-$year}/{-$month}/{-$day}',
        params: { year: '2023' },
        result: '/2023',
      },
      {
        name: 'multiple consecutive optional params - none provided',
        path: '/{-$year}/{-$month}/{-$day}',
        params: {},
        result: '/',
      },
      {
        name: 'optional param with special characters',
        path: '/posts/{-$category}',
        params: { category: 'tech & science' },
        result: '/posts/tech%20%26%20science',
      },
      {
        name: 'optional param with number',
        path: '/posts/{-$page}',
        params: { page: 42 },
        result: '/posts/42',
      },
    ])('$name', ({ path, params, result }) => {
      expect(interpolatePath({ path, params }).interpolatedPath).toBe(result)
    })
  })

  describe('matchPathname with optional params', () => {
    it.each([
      {
        name: 'optional param present in URL',
        input: '/posts/tech',
        matchingOptions: { to: '/posts/{-$category}' },
        expectedMatchedParams: { category: 'tech' },
      },
      {
        name: 'optional param absent in URL',
        input: '/posts',
        matchingOptions: { to: '/posts/{-$category}' },
        expectedMatchedParams: {},
      },
      {
        name: 'multiple optional params - all present',
        input: '/posts/tech/hello-world',
        matchingOptions: { to: '/posts/{-$category}/{-$slug}' },
        expectedMatchedParams: { category: 'tech', slug: 'hello-world' },
      },
      {
        name: 'multiple optional params - partially present',
        input: '/posts/tech',
        matchingOptions: { to: '/posts/{-$category}/{-$slug}' },
        expectedMatchedParams: { category: 'tech' },
      },
      {
        name: 'multiple optional params - none present',
        input: '/posts',
        matchingOptions: { to: '/posts/{-$category}/{-$slug}' },
        expectedMatchedParams: {},
      },
      {
        name: 'mixed required and optional params - all present',
        input: '/users/123/settings',
        matchingOptions: { to: '/users/$id/{-$tab}' },
        expectedMatchedParams: { id: '123', tab: 'settings' },
      },
      {
        name: 'mixed required and optional params - optional absent',
        input: '/users/123',
        matchingOptions: { to: '/users/$id/{-$tab}' },
        expectedMatchedParams: { id: '123' },
      },
      {
        name: 'optional param with prefix and suffix - present',
        input: '/posts/prefixtech.html',
        matchingOptions: { to: '/posts/prefix{-$category}.html' },
        expectedMatchedParams: { category: 'tech' },
      },
      {
        name: 'optional param with prefix and suffix - absent',
        input: '/posts',
        matchingOptions: { to: '/posts/prefix{-$category}.html' },
        expectedMatchedParams: {},
      },
      {
        name: 'optional param between required segments',
        input: '/users/123/settings/edit',
        matchingOptions: { to: '/users/$id/{-$section}/edit' },
        expectedMatchedParams: { id: '123', section: 'settings' },
      },
      {
        name: 'optional param between required segments - omitted',
        input: '/users/123/edit',
        matchingOptions: { to: '/users/$id/{-$section}/edit' },
        expectedMatchedParams: { id: '123' },
      },
      {
        name: 'consecutive optional params - all present',
        input: '/2023/12/25',
        matchingOptions: { to: '/{-$year}/{-$month}/{-$day}' },
        expectedMatchedParams: { year: '2023', month: '12', day: '25' },
      },
      {
        name: 'consecutive optional params - partially present',
        input: '/2023/12',
        matchingOptions: { to: '/{-$year}/{-$month}/{-$day}' },
        expectedMatchedParams: { year: '2023', month: '12' },
      },
      {
        name: 'consecutive optional params - first only',
        input: '/2023',
        matchingOptions: { to: '/{-$year}/{-$month}/{-$day}' },
        expectedMatchedParams: { year: '2023' },
      },
      {
        name: 'consecutive optional params - none present',
        input: '/',
        matchingOptions: { to: '/{-$year}/{-$month}/{-$day}' },
        expectedMatchedParams: {},
      },
    ])('$name', ({ input, matchingOptions, expectedMatchedParams }) => {
      expect(matchPathname('/', input, matchingOptions)).toStrictEqual(
        expectedMatchedParams,
      )
    })
  })

  describe('edge cases', () => {
    it('should handle optional parameters with validation', () => {
      // This test will be expanded when we implement params.parse for optional params
      const path = '/posts/{-$category}'
      const params = { category: 'tech' }
      expect(interpolatePath({ path, params }).interpolatedPath).toBe(
        '/posts/tech',
      )
    })

    it('should handle multiple consecutive optional parameters correctly', () => {
      const tests = [
        { input: '/', pattern: '/{-$a}/{-$b}/{-$c}', expected: {} },
        { input: '/1', pattern: '/{-$a}/{-$b}/{-$c}', expected: { a: '1' } },
        {
          input: '/1/2',
          pattern: '/{-$a}/{-$b}/{-$c}',
          expected: { a: '1', b: '2' },
        },
        {
          input: '/1/2/3',
          pattern: '/{-$a}/{-$b}/{-$c}',
          expected: { a: '1', b: '2', c: '3' },
        },
      ]

      tests.forEach(({ input, pattern, expected }) => {
        expect(matchPathname('/', input, { to: pattern })).toEqual(expected)
      })
    })

    it('should prioritize more specific routes over optional param routes', () => {
      // Test that /posts/featured matches a static route, not optional param route
      const staticMatch = matchPathname('/', '/posts/featured', {
        to: '/posts/featured',
      })
      const optionalMatch = matchPathname('/', '/posts/featured', {
        to: '/posts/{-$category}',
      })

      expect(staticMatch).toEqual({})
      expect(optionalMatch).toEqual({ category: 'featured' })
    })

    it('should handle optional parameters with wildcards', () => {
      const input = '/docs/v2/extra/path'
      const pattern = '/docs/{-$version}/$'
      const expected = {
        version: 'v2',
        '*': 'extra/path',
        _splat: 'extra/path',
      }

      expect(matchPathname('/', input, { to: pattern })).toEqual(expected)
    })
  })
})
