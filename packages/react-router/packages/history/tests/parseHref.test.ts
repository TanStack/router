import { describe, expect, test } from 'vitest'
import { parseHref } from '../src'

describe('parseHref', () => {
  test('works', () => {
    const parsed = parseHref('/foo?bar=baz#qux', {})
    expect(parsed.pathname).toEqual('/foo')
    expect(parsed.search).toEqual('?bar=baz')
    expect(parsed.hash).toEqual('#qux')
  })
})
