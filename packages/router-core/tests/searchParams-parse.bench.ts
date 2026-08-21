import { bench, describe, expect } from 'vitest'
import { defaultParseSearch } from '../src'

const iterations = 1_000

const ordinaryStrings = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'newest',
}
const nonLiteralInitialStrings = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'descending',
}
const jsonInitialStrings = {
  filter: 'foo',
  notification: 'new',
  tab: 'tabular',
  empty: '',
}
const emptyStrings = {
  first: '',
  second: '',
  third: '',
  fourth: '',
}
const punctuationStrings = {
  file: '.env',
  path: '/products',
  positive: '+1',
  priority: '!important',
}
const nonLiteralPrefixStrings = {
  first: 'future',
  second: 'framework',
  third: 'name',
  fourth: 'table',
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
const jsonLiteralBoundaryStrings = {
  truthy: 'true-value',
  falsy: 'false/value',
  nullable: 'null.value',
}
const jsonStrings = {
  number: '123',
  boolean: 'true',
  object: '{"nested":true}',
  array: '[1,2,3]',
}
const mixedValues = {
  tab: 'specs',
  page: '2',
  filters: 'available',
  exactPage: '2',
}

function toSearchString(search: Record<string, unknown>): string {
  return Object.entries(search)
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

let benchmarkSink = 0

// Correctness expectations for the parse side.
expect(defaultParseSearch(toSearchString(ordinaryStrings))).toEqual(
  ordinaryStrings,
)
expect(defaultParseSearch(toSearchString(nonLiteralInitialStrings))).toEqual(
  nonLiteralInitialStrings,
)
expect(defaultParseSearch(toSearchString(jsonInitialStrings))).toEqual(
  jsonInitialStrings,
)
expect(defaultParseSearch(toSearchString(emptyStrings))).toEqual(emptyStrings)
expect(defaultParseSearch(toSearchString(punctuationStrings))).toEqual({
  ...punctuationStrings,
  positive: 1,
})
expect(defaultParseSearch(toSearchString(nonLiteralPrefixStrings))).toEqual(
  nonLiteralPrefixStrings,
)
expect(defaultParseSearch(toSearchString(jsonLiteralPrefixStrings))).toEqual(
  jsonLiteralPrefixStrings,
)
expect(defaultParseSearch(toSearchString(jsonLiteralWordStrings))).toEqual(
  jsonLiteralWordStrings,
)
expect(defaultParseSearch(toSearchString(jsonLiteralBoundaryStrings))).toEqual(
  jsonLiteralBoundaryStrings,
)
expect(defaultParseSearch(toSearchString(jsonStrings))).toEqual({
  number: 123,
  boolean: true,
  object: { nested: true },
  array: [1, 2, 3],
})

function parseBatch(searchStr: string) {
  let size = 0
  for (let index = 0; index < iterations; index++) {
    size += Object.keys(defaultParseSearch(searchStr)).length
  }
  benchmarkSink = size
}

describe('default search parsing', () => {
  bench('ordinary string values', () => {
    parseBatch(toSearchString(ordinaryStrings))
  })

  bench('ordinary strings outside JSON-literal initials', () => {
    parseBatch(toSearchString(nonLiteralInitialStrings))
  })

  bench('ordinary strings with JSON-literal initials', () => {
    parseBatch(toSearchString(jsonInitialStrings))
  })

  bench('empty string values', () => {
    parseBatch(toSearchString(emptyStrings))
  })

  bench('ordinary strings with non-JSON punctuation starts', () => {
    parseBatch(toSearchString(punctuationStrings))
  })

  bench('ordinary f/n/t words outside JSON-literal prefixes', () => {
    parseBatch(toSearchString(nonLiteralPrefixStrings))
  })

  bench('application words with JSON-literal prefixes', () => {
    parseBatch(toSearchString(jsonLiteralPrefixStrings))
  })

  bench('application words with complete JSON-literal prefixes', () => {
    parseBatch(toSearchString(jsonLiteralWordStrings))
  })

  bench('JSON-literal prefixes followed by punctuation', () => {
    parseBatch(toSearchString(jsonLiteralBoundaryStrings))
  })

  bench('JSON-compatible string values', () => {
    parseBatch(toSearchString(jsonStrings))
  })

  bench('mixed application values', () => {
    parseBatch(toSearchString(mixedValues))
  })
})

void benchmarkSink
