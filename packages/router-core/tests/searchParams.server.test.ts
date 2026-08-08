import { describe, expect, test, vi } from 'vitest'
import { defaultParseSearch, stringifySearchWith } from '../src/searchParams'

vi.mock('@tanstack/router-core/isServer', () => ({ isServer: true }))

describe('server search serialization', () => {
  test('skips JSON.parse for invalid literal-prefix strings', () => {
    const parseSpy = vi.spyOn(JSON, 'parse')
    const input = {
      date: '2026-08-08',
      decimal: '1.2.3',
      empty: '',
      exponent: '1e',
      falsePrefix: 'favorite',
      falseWord: 'false_value',
      fraction: '1.',
      leadingZero: '01',
      nullPrefix: 'number',
      nullWord: 'null.value',
      truePrefix: 'travel',
      trueWord: 'true-value',
    }
    let search = ''
    try {
      const stringify = stringifySearchWith(JSON.stringify, JSON.parse)

      search = stringify(input)
      expect(parseSpy).not.toHaveBeenCalled()
    } finally {
      parseSpy.mockRestore()
    }
    expect(defaultParseSearch(search)).toEqual(input)
  })

  test.each([
    'false',
    'true',
    'null',
    '-1',
    '0',
    '123',
    '-0',
    '0.0',
    '10.25',
    '0.5',
    '-0.5',
    '1e10',
    '1E+10',
    '1E-10',
    '1e01',
    'false\t',
  ])('serializes validated JSON primitive %j without parsing', (value) => {
    const parseSpy = vi.spyOn(JSON, 'parse')
    let search = ''
    try {
      const stringify = stringifySearchWith(JSON.stringify, JSON.parse)

      search = stringify({ value })
      expect(parseSpy).not.toHaveBeenCalled()
    } finally {
      parseSpy.mockRestore()
    }
    expect(defaultParseSearch(search)).toEqual({ value })
  })

  test.each([
    '-',
    '+1',
    '00',
    '01',
    '-00',
    '-01',
    '.1',
    '-.1',
    '1.',
    '1.2.3',
    '0x1',
    '1_000',
    '1 2',
    '1e',
    '1e+',
    '1e-',
    '1e1.0',
    '--1',
    '- 1',
    'NaN',
    'Infinity',
    '2026-08-08',
    '\ftrue',
    '\v0',
    '\u00a0null',
    '\ufeff1',
    '\u2028false',
  ])('rejects invalid primitive-like JSON %j without parsing', (value) => {
    expect(() => JSON.parse(value)).toThrow()

    const parseSpy = vi.spyOn(JSON, 'parse')
    let search = ''
    try {
      const stringify = stringifySearchWith(JSON.stringify, JSON.parse)

      search = stringify({ value })
      expect(parseSpy).not.toHaveBeenCalled()
    } finally {
      parseSpy.mockRestore()
    }
    expect(defaultParseSearch(search)).toEqual({ value })
  })

  test.each([
    '"quoted"',
    '{}',
    '[]',
    ' true ',
    '\nnull\r',
    ' 1.5e+2 ',
    '\t0e0\n',
    '\r-0.0E+01\t',
    '\t"quoted"\r',
    '\n[1]\r',
    ' {"x":1}\t',
  ])('still parses JSON value %j that requires the full parser', (value) => {
    const parseSpy = vi.spyOn(JSON, 'parse')
    let search = ''
    try {
      const stringify = stringifySearchWith(JSON.stringify, JSON.parse)

      search = stringify({ value })
      expect(parseSpy).toHaveBeenCalledOnce()
      expect(parseSpy).toHaveBeenCalledWith(value)
    } finally {
      parseSpy.mockRestore()
    }
    expect(defaultParseSearch(search)).toEqual({ value })
  })

  test.each(['"unterminated', '[1,', '{"x":}', '   ', '\t future'])(
    'falls back to the raw malformed JSON %j',
    (value) => {
      const parseSpy = vi.spyOn(JSON, 'parse')
      let search = ''
      try {
        const stringify = stringifySearchWith(JSON.stringify, JSON.parse)

        search = stringify({ value })
        expect(parseSpy).toHaveBeenCalledOnce()
        expect(parseSpy).toHaveBeenCalledWith(value)
      } finally {
        parseSpy.mockRestore()
      }
      expect(defaultParseSearch(search)).toEqual({ value })
    },
  )

  test('keeps custom parser behavior unchanged', () => {
    const parser = vi.fn((value: string) => {
      if (value === 'word') {
        return value
      }
      throw new Error('not parseable')
    })
    const stringify = stringifySearchWith(JSON.stringify, parser)

    expect(stringify({ value: 'word' })).toEqual('?value=%22word%22')
    expect(parser).toHaveBeenCalledWith('word')
  })

  test('still catches serializer errors for validated primitives', () => {
    const stringify = stringifySearchWith((value) => {
      if (typeof value === 'string') {
        throw new Error('not serializable')
      }
      return JSON.stringify(value)
    }, JSON.parse)

    expect(stringify({ value: 'true' })).toEqual('?value=true')
  })

  test('preserves object and non-string serialization behavior', () => {
    const input = {
      object: { nested: true },
      array: [1, 2, 3],
      nullable: null,
      omitted: undefined,
    }
    const search = stringifySearchWith(JSON.stringify, JSON.parse)(input)

    expect(defaultParseSearch(search)).toEqual({
      object: input.object,
      array: input.array,
      nullable: null,
    })
  })

  test('still catches object serializer errors', () => {
    const stringify = stringifySearchWith(() => {
      throw new Error('not serializable')
    }, JSON.parse)

    expect(stringify({ value: { nested: true } })).toEqual(
      '?value=%5Bobject+Object%5D',
    )
  })

  test('preserves cyclic-object fallback behavior', () => {
    const value: Record<string, unknown> = {}
    value.self = value

    expect(stringifySearchWith(JSON.stringify, JSON.parse)({ value })).toEqual(
      '?value=%5Bobject+Object%5D',
    )
  })
})
