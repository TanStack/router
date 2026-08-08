import { bench, describe, expect, vi } from 'vitest'
import { defaultParseSearch, defaultStringifySearch } from '../src/searchParams'

vi.mock('@tanstack/router-core/isServer', () => ({ isServer: true }))

const iterations = 1_000
const exceptionIterations = 100
const ordinaryStrings = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'newest',
}
const jsonLiteralPrefixStrings = {
  first: 'favorite',
  second: 'number',
  third: 'travel',
  fourth: 'nullish',
}
const jsonLiteralWordStrings = {
  truthy: 'true_value',
  falsy: 'false_value',
  nullable: 'null_value',
}
const jsonStrings = {
  number: '123',
  boolean: 'true',
  object: '{"nested":true}',
  array: '[1,2,3]',
}
const jsonPrimitiveStrings = {
  integer: '123',
  decimal: '-0.5',
  exponent: '1e10',
  boolean: 'true',
  nullable: 'null',
}
const jsonStructuredStrings = {
  quoted: '"value"',
  object: '{"nested":true}',
  array: '[1,2,3]',
  nested: '{"items":[1,{"ok":true}]}',
}
const numericLikeStrings = {
  date: '2026-08-08',
  version: '1.2.3',
  leadingZero: '01',
  fraction: '1.',
  exponent: '1e',
}
const malformedStructuredStrings = {
  quoted: '"unterminated',
  object: '{"broken":',
  array: '[1,',
}
const longValidNumber = { value: '1'.repeat(256) }
const longInvalidNumber = { value: `${'1'.repeat(256)}x` }
const expectedDistribution = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'newest',
  page: '2',
  showArchived: 'false',
  filters: '["available","featured"]',
}
const whitespace16 = { value: `${' '.repeat(16)}{}` }
const whitespace64 = { value: `${' '.repeat(64)}{}` }
const whitespace256 = { value: `${' '.repeat(256)}{}` }
const whitespace1024 = { value: `${' '.repeat(1_024)}{}` }
const mixedValues = {
  tab: 'specs',
  page: 2,
  filters: ['available', 'featured'],
  exactPage: '2',
}
let benchmarkSink = 0

expect(defaultStringifySearch(ordinaryStrings)).toBe(
  '?tab=specs&filter=available&category=hardware&sort=newest',
)
expect(defaultStringifySearch(jsonLiteralPrefixStrings)).toBe(
  '?first=favorite&second=number&third=travel&fourth=nullish',
)
expect(defaultStringifySearch(jsonLiteralWordStrings)).toBe(
  '?truthy=true_value&falsy=false_value&nullable=null_value',
)
expect(defaultStringifySearch(jsonStrings)).toBe(
  '?number=%22123%22&boolean=%22true%22&object=%22%7B%5C%22nested%5C%22%3Atrue%7D%22&array=%22%5B1%2C2%2C3%5D%22',
)
expect(defaultStringifySearch(jsonPrimitiveStrings)).toBe(
  '?integer=%22123%22&decimal=%22-0.5%22&exponent=%221e10%22&boolean=%22true%22&nullable=%22null%22',
)
const jsonStructuredSearch = defaultStringifySearch(jsonStructuredStrings)
expect(defaultParseSearch(jsonStructuredSearch)).toEqual(jsonStructuredStrings)
expect(defaultStringifySearch(numericLikeStrings)).toBe(
  '?date=2026-08-08&version=1.2.3&leadingZero=01&fraction=1.&exponent=1e',
)
for (const input of [
  malformedStructuredStrings,
  longValidNumber,
  longInvalidNumber,
  expectedDistribution,
  whitespace16,
  whitespace64,
  whitespace256,
  whitespace1024,
]) {
  expect(defaultParseSearch(defaultStringifySearch(input))).toEqual(input)
}
expect(defaultStringifySearch(mixedValues)).toBe(
  '?tab=specs&page=2&filters=%5B%22available%22%2C%22featured%22%5D&exactPage=%222%22',
)

function stringifyBatch(search: Record<string, unknown>, count = iterations) {
  let size = 0
  for (let index = 0; index < count; index++) {
    size += defaultStringifySearch(search).length
  }
  benchmarkSink = size
}

describe('server default search serialization', () => {
  bench('ordinary string values', () => {
    stringifyBatch(ordinaryStrings)
  })

  bench('application words with JSON-literal prefixes', () => {
    stringifyBatch(jsonLiteralPrefixStrings, exceptionIterations)
  })

  bench('application words with complete JSON-literal prefixes', () => {
    stringifyBatch(jsonLiteralWordStrings, exceptionIterations)
  })

  bench('JSON-compatible string values', () => {
    stringifyBatch(jsonStrings)
  })

  bench('JSON primitive string values', () => {
    stringifyBatch(jsonPrimitiveStrings)
  })

  bench('quoted and structured JSON string values', () => {
    stringifyBatch(jsonStructuredStrings)
  })

  bench('invalid number-like string values', () => {
    stringifyBatch(numericLikeStrings, exceptionIterations)
  })

  bench('malformed structured JSON strings', () => {
    stringifyBatch(malformedStructuredStrings, exceptionIterations)
  })

  bench('long valid JSON number string', () => {
    stringifyBatch(longValidNumber)
  })

  bench('long near-valid JSON number string', () => {
    stringifyBatch(longInvalidNumber)
  })

  bench('expected application distribution', () => {
    stringifyBatch(expectedDistribution)
  })

  bench('structured JSON after 16 whitespace bytes', () => {
    stringifyBatch(whitespace16)
  })

  bench('structured JSON after 64 whitespace bytes', () => {
    stringifyBatch(whitespace64)
  })

  bench('structured JSON after 256 whitespace bytes', () => {
    stringifyBatch(whitespace256)
  })

  bench('structured JSON after 1024 whitespace bytes', () => {
    stringifyBatch(whitespace1024)
  })

  bench('mixed application values', () => {
    stringifyBatch(mixedValues)
  })
})

void benchmarkSink
