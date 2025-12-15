import { describe, expect, test } from 'vitest'
import { stripQueryString } from '../src/plugin-utils'

describe('stripQueryString', () => {
  test('strips query string from path', () => {
    expect(stripQueryString('/path/to/file.ts?v=123')).toBe('/path/to/file.ts')
  })

  test('returns path unchanged when no query string', () => {
    expect(stripQueryString('/path/to/file.ts')).toBe('/path/to/file.ts')
  })

  test('handles multiple query parameters', () => {
    expect(stripQueryString('/path/to/file.ts?v=123&other=abc')).toBe(
      '/path/to/file.ts',
    )
  })
})
