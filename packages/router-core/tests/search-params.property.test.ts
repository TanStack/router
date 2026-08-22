import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { defaultParseSearch, defaultStringifySearch } from '../src/searchParams'

/**
 * Property-based invariants for the default search-param serializers.
 *
 * The query string is attacker-controlled: JSON.parse runs on URL text and
 * parsed values flow into loaders/search validation. These properties pin
 * the guarantees (and the deliberate, documented quirks) of the pipeline.
 */

// JSON-safe values with string keys; keys become strings through any object
const jsonValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.integer(), { maxLength: 3 }),
  fc.record({ a: fc.integer(), b: fc.boolean() }, { maxKeys: 2 }),
)

describe('default search param serialization', () => {
  it('parsing never throws for any search string', () => {
    fc.assert(
      fc.property(fc.string(), (search) => {
        expect(() => defaultParseSearch(search)).not.toThrow()
      }),
    )
  })

  it('parse result always has a null prototype', () => {
    ;(fc.assert(
      fc.property(fc.string(), (search) => {
        const result = defaultParseSearch(search)
        expect(Object.getPrototypeOf(result)).toBe(null)
      }),
    ),
      { numRuns: 200 })
  })

  it('round-trips JSON values: stringify then parse yields equal data', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ maxLength: 8 }), jsonValueArb, {
          maxKeys: 5,
        }),
        (searchObj) => {
          const serialized = defaultStringifySearch(searchObj)
          const parsed = defaultParseSearch(serialized)
          expect(parsed).toEqual(searchObj)
        },
      ),
    )
  })

  it('__proto__ as key never pollutes Object.prototype', () => {
    const result = defaultParseSearch(
      '?__proto__=%7B%22polluted%22%3Atrue%7D&safe=1',
    )
    expect((Object.prototype as any).polluted).toBeUndefined()
    expect(({} as any).polluted).toBeUndefined()
    // readable as own property data
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')).toBeDefined()
  })

  it('malformed JSON values stay strings instead of throwing', () => {
    // '{' can start JSON so the parser is attempted; failure must be silent
    const result = defaultParseSearch('?q=%7Binvalid%20json%7D')
    expect(result.q).toBe('{invalid json}')
  })

  it('DOCUMENTED QUIRK: strings that look like JSON are type-coerced on read', () => {
    // ' 42' / 'true' / '[1]' parse as JSON after leading-whitespace trim,
    // so a plain string value changes type across a read. This is long-
    // standing designed behavior (JSON-ish coercion), pinned here so a
    // change is conscious. Apps needing exact strings must use custom
    // search param serialization or stringifiable wrappers.
    expect(defaultParseSearch('?q=%2042').q).toBe(42)
    expect(defaultParseSearch('?q=true').q).toBe(true)
    expect(defaultParseSearch('?q=%5B1%2C2%5D').q).toEqual([1, 2])
    // but non-JSON-looking strings are untouched
    expect(defaultParseSearch('?q=navy').q).toBe('navy')
    expect(defaultParseSearch('?q=01').q).toBe('01')
  })
})
