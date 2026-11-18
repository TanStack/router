import { describe, expect, test } from 'vitest'
import { defaultStringifySearch } from '../src'

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
  page: 2,
  filters: ['available', 'featured'],
  exactPage: '2',
}
let benchmarkSink = 0

expect(defaultStringifySearch(ordinaryStrings)).toBe(
  '?tab=specs&filter=available&category=hardware&sort=newest',
)
expect(defaultStringifySearch(nonLiteralInitialStrings)).toBe(
  '?tab=specs&filter=available&category=hardware&sort=descending',
)
expect(defaultStringifySearch(jsonInitialStrings)).toBe(
  '?filter=foo&notification=new&tab=tabular&empty=',
)
expect(defaultStringifySearch(emptyStrings)).toBe(
  '?first=&second=&third=&fourth=',
)
expect(defaultStringifySearch(punctuationStrings)).toBe(
  '?file=.env&path=%2Fproducts&positive=%2B1&priority=%21important',
)
expect(defaultStringifySearch(nonLiteralPrefixStrings)).toBe(
  '?first=future&second=framework&third=name&fourth=table',
)
expect(defaultStringifySearch(jsonLiteralPrefixStrings)).toBe(
  '?first=favorite&second=number&third=travel&fourth=nullish',
)
expect(defaultStringifySearch(jsonLiteralWordStrings)).toBe(
  '?truthy=true_value&falsy=false_value&nullable=null_value',
)
expect(defaultStringifySearch(jsonLiteralBoundaryStrings)).toBe(
  '?truthy=true-value&falsy=false%2Fvalue&nullable=null.value',
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
  test('empty object', async ({ bench }) => {
    await bench('empty object', () => {
      stringifyBatch({})
    }).run()
  })

  test('only undefined values', async ({ bench }) => {
    await bench('only undefined values', () => {
      stringifyBatch({ first: undefined, second: undefined })
    }).run()
  })

  test('ordinary string values', async ({ bench }) => {
    await bench('ordinary string values', () => {
      stringifyBatch(ordinaryStrings)
    }).run()
  })

  test('ordinary strings outside JSON-literal initials', async ({ bench }) => {
    await bench('ordinary strings outside JSON-literal initials', () => {
      stringifyBatch(nonLiteralInitialStrings)
    }).run()
  })

  test('ordinary strings with JSON-literal initials', async ({ bench }) => {
    await bench('ordinary strings with JSON-literal initials', () => {
      stringifyBatch(jsonInitialStrings)
    }).run()
  })

  test('empty string values', async ({ bench }) => {
    await bench('empty string values', () => {
      stringifyBatch(emptyStrings)
    }).run()
  })

  test('ordinary strings with non-JSON punctuation starts', async ({
    bench,
  }) => {
    await bench('ordinary strings with non-JSON punctuation starts', () => {
      stringifyBatch(punctuationStrings)
    }).run()
  })

  test('ordinary f/n/t words outside JSON-literal prefixes', async ({
    bench,
  }) => {
    await bench('ordinary f/n/t words outside JSON-literal prefixes', () => {
      stringifyBatch(nonLiteralPrefixStrings)
    }).run()
  })

  test('application words with JSON-literal prefixes', async ({ bench }) => {
    await bench('application words with JSON-literal prefixes', () => {
      stringifyBatch(jsonLiteralPrefixStrings)
    }).run()
  })

  test('application words with complete JSON-literal prefixes', async ({
    bench,
  }) => {
    await bench('application words with complete JSON-literal prefixes', () => {
      stringifyBatch(jsonLiteralWordStrings)
    }).run()
  })

  test('JSON-literal prefixes followed by punctuation', async ({ bench }) => {
    await bench('JSON-literal prefixes followed by punctuation', () => {
      stringifyBatch(jsonLiteralBoundaryStrings)
    }).run()
  })

  test('JSON-compatible string values', async ({ bench }) => {
    await bench('JSON-compatible string values', () => {
      stringifyBatch(jsonStrings)
    }).run()
  })

  test('mixed application values', async ({ bench }) => {
    await bench('mixed application values', () => {
      stringifyBatch(mixedValues)
    }).run()
  })
})

void benchmarkSink
