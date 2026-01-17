import { describe, expect, test } from 'vitest'
import { getNormalizedURL } from '../src/ssr/ssr-server'

describe('getNormalizedURL', () => {
  test('should return URL that is in standardized format', () => {
    const url1 = 'https://example.com/%EB%8C%80%7C/path?query=%EB%8C%80|#hash'
    const url2 = 'https://example.com/%EB%8C%80|/path?query=%EB%8C%80%7C#hash'

    const normalizedUrl1 = getNormalizedURL(url1)
    const normalizedUrl2 = getNormalizedURL(url2)

    expect(normalizedUrl1.pathname).toBe('/%EB%8C%80|/path')
    expect(normalizedUrl1.pathname).toBe(normalizedUrl2.pathname)
    expect(new URL(url1).pathname).not.toBe(new URL(url2).pathname)

    expect(normalizedUrl1.search).toBe(`?query=%EB%8C%80%7C`)
    expect(normalizedUrl1.search).toBe(normalizedUrl2.search)
    expect(new URL(url1).search).not.toBe(new URL(url2).search)
  })

  test('should treat encoded URL specific characters correctly', () => {
    const url = 'https://example.com/ab%3F|%23abc/path?query=%EB%8C%80|#hash'
    const normalizedUrl = getNormalizedURL(url)
    expect(normalizedUrl.pathname).toBe('/ab%3F|%23abc/path')
  })
})
