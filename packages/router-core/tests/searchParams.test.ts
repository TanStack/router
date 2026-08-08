import { describe, expect, test, vi } from 'vitest'
import {
  defaultParseSearch,
  defaultStringifySearch,
  parseSearchWith,
  stringifySearchWith,
} from '../src'

describe('Search Params serialization and deserialization', () => {
  /*
   * JSON-compatible objects can be serialized into a string,
   * and then deserialized back into the original object.
   */
  test.each([
    [{}, ''],
    [{ foo: '' }, '?foo='],
    [{ foo: 'bar' }, '?foo=bar'],
    [{ foo: 'bar baz' }, '?foo=bar+baz'],
    [{ foo: 123 }, '?foo=123'],
    [{ foo: '123' }, '?foo=%22123%22'],
    [{ foo: true }, '?foo=true'],
    [{ foo: 'true' }, '?foo=%22true%22'],
    [{ foo: null }, '?foo=null'],
    [{ foo: 'null' }, '?foo=%22null%22'],
    [{ foo: 'undefined' }, '?foo=undefined'],
    [{ foo: {} }, '?foo=%7B%7D'],
    [{ foo: '{}' }, '?foo=%22%7B%7D%22'],
    [{ foo: [] }, '?foo=%5B%5D'],
    [{ foo: '[]' }, '?foo=%22%5B%5D%22'],
    [{ foo: [1, 2, 3] }, '?foo=%5B1%2C2%2C3%5D'],
    [{ foo: '1,2,3' }, '?foo=1%2C2%2C3'],
    [{ foo: { bar: 'baz' } }, '?foo=%7B%22bar%22%3A%22baz%22%7D'],
    [{ 0: 1 }, '?0=1'],
    [{ 'foo=bar': 1 }, '?foo%3Dbar=1'],
    [{ '{}': 1 }, '?%7B%7D=1'],
    [{ '': 1 }, '?=1'],
    [{ '=': '=' }, '?%3D=%3D'],
    [{ '=': '', '': '=' }, '?%3D=&=%3D'],
    [{ 'foo=2&bar': 3 }, '?foo%3D2%26bar=3'],
    [{ 'foo?': 1 }, '?foo%3F=1'],
    [{ foo: 'bar=' }, '?foo=bar%3D'],
    [{ foo: '2&bar=3' }, '?foo=2%26bar%3D3'],
  ])('isomorphism %j', (input, expected) => {
    const str = defaultStringifySearch(input)
    expect(str).toEqual(expected)
    expect(defaultParseSearch(str)).toEqual(input)
  })

  test('undefined values are removed during stringification', () => {
    const str = defaultStringifySearch({ foo: 'bar', bar: undefined })
    expect(str).toEqual('?foo=bar')
    expect(defaultParseSearch(str)).toEqual({ foo: 'bar' })
  })

  test('[edge case] self-reference serializes to "object Object"', () => {
    const obj = {} as any
    obj.self = obj
    const str = defaultStringifySearch(obj)
    expect(str).toEqual('?self=%5Bobject+Object%5D')
    expect(defaultParseSearch(str)).toEqual({ self: '[object Object]' })
  })

  /*
   * It is able to parse strings that could not have come
   * from the serializer.
   *
   * This can be useful because search params can be manipulated
   * by human users.
   */
  test.each([
    ['?foo={}', { foo: {} }],
    ['?foo=[]', { foo: [] }],
    ['?foo=1,2,3', { foo: '1,2,3' }],
    ['?foo={"bar":"baz"}', { foo: { bar: 'baz' } }],
    ['?foo=1&foo=2', { foo: [1, 2] }],
    ['?foo=""', { foo: '' }],
    ['?foo=""""', { foo: '""""' }],
    ['?foo=()', { foo: '()' }],
    ['?foo=[{}]', { foo: [{}] }],
  ])('alien deserialization %s', (input, expected) => {
    const obj = defaultParseSearch(input)
    expect(obj).toEqual(expected)
    expect(defaultStringifySearch(obj)).not.toBe(input)
  })

  /*
   * It can serialize stuff that really shouldn't be passed as input.
   * But just in case, this test serves as documentation of "what would happen"
   * if you did.
   */
  test('[edge case] inputs that are not primitive objects', () => {
    expect(defaultStringifySearch(new Number(99))).toEqual('')
    expect(defaultStringifySearch({ foo: new Number(99) })).toEqual('?foo=99')
    expect(defaultStringifySearch(new String('foo'))).toEqual('?0=f&1=o&2=o')
    expect(defaultStringifySearch(new Promise(() => {}))).toEqual('')
    expect(defaultStringifySearch({ foo: new Promise(() => {}) })).toEqual(
      '?foo=%7B%7D',
    )
    expect(defaultStringifySearch([1])).toEqual('?0=1')
    const date = new Date('2024-11-18')
    expect(defaultStringifySearch(date)).toEqual('')
    expect(defaultStringifySearch({ foo: date })).toEqual(
      '?foo=%222024-11-18T00%3A00%3A00.000Z%22',
    )
  })

  test('custom parsers still run for non-json-looking strings', () => {
    const parser = vi.fn((value: string) => {
      if (!value.startsWith('~')) {
        throw new Error('not custom-encoded')
      }

      return value.slice(1)
    })

    const parseSearch = parseSearchWith(parser)
    const stringifySearch = stringifySearchWith((value) => `~${value}`, parser)

    expect(parseSearch('?filter=%7Eauthor')).toEqual({ filter: 'author' })
    expect(stringifySearch({ filter: '~author' })).toEqual(
      '?filter=%7E%7Eauthor',
    )
    expect(parseSearch(stringifySearch({ filter: '~author' }))).toEqual({
      filter: '~author',
    })
  })

  test('skips JSON.parse work for obviously non-json strings', () => {
    const parseSpy = vi.spyOn(JSON, 'parse')

    try {
      const parseSearch = parseSearchWith(JSON.parse)
      const stringifySearch = stringifySearchWith(JSON.stringify, JSON.parse)

      expect(parseSearch('?plain=value&other=abc123')).toEqual({
        plain: 'value',
        other: 'abc123',
      })
      expect(stringifySearch({ plain: 'value', other: 'abc123' })).toEqual(
        '?plain=value&other=abc123',
      )

      expect(parseSpy).not.toHaveBeenCalled()
    } finally {
      parseSpy.mockRestore()
    }
  })

  test('still parses json-like strings with JSON.parse', () => {
    const parseSpy = vi.spyOn(JSON, 'parse')

    try {
      const parseSearch = parseSearchWith(JSON.parse)
      const stringifySearch = stringifySearchWith(JSON.stringify, JSON.parse)

      expect(
        parseSearch('?quoted=%22value%22&object=%7B%22ok%22%3Atrue%7D&num=123'),
      ).toEqual({
        quoted: 'value',
        object: { ok: true },
        num: 123,
      })
      expect(
        stringifySearch({ quoted: '123', object: { ok: true }, num: '42' }),
      ).toEqual('?quoted=%22123%22&object=%7B%22ok%22%3Atrue%7D&num=%2242%22')

      expect(parseSpy).toHaveBeenCalled()
    } finally {
      parseSpy.mockRestore()
    }
  })
})
