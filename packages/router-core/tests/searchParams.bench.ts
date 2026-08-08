import { bench, describe, expect } from 'vitest'
import { defaultStringifySearch } from '../src'

const iterations = 1_000

const ordinaryStrings = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'newest',
}
const jsonPrefixStrings = {
  filter: 'foo',
  notification: 'new',
  tab: 'tabular',
  empty: '',
}
const jsonStrings = {
  number: '123',
  boolean: 'true',
  object: '{"nested":true}',
  array: '[1,2,3]',
}
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
expect(defaultStringifySearch(jsonPrefixStrings)).toBe(
  '?filter=foo&notification=new&tab=tabular&empty=',
)
expect(defaultStringifySearch(jsonStrings)).toBe(
  '?number=%22123%22&boolean=%22true%22&object=%22%7B%5C%22nested%5C%22%3Atrue%7D%22&array=%22%5B1%2C2%2C3%5D%22',
)
expect(defaultStringifySearch(mixedValues)).toBe(
  '?tab=specs&page=2&filters=%5B%22available%22%2C%22featured%22%5D&exactPage=%222%22',
)

function stringifyBatch(search: Record<string, unknown>) {
  let size = 0
  for (let index = 0; index < iterations; index++) {
    size += defaultStringifySearch(search).length
  }
  benchmarkSink = size
}

describe('default search serialization', () => {
  bench('ordinary string values', () => {
    stringifyBatch(ordinaryStrings)
  })

  bench('ordinary strings with JSON-prefix characters', () => {
    stringifyBatch(jsonPrefixStrings)
  })

  bench('JSON-compatible string values', () => {
    stringifyBatch(jsonStrings)
  })

  bench('mixed application values', () => {
    stringifyBatch(mixedValues)
  })
})

void benchmarkSink
