import { describe, expect, test } from 'vitest'
import { parseHref } from '../src'

const baseUrl = new URL('https://victim.example/base')

describe('parseHref', () => {
  test.each(['\t', '\n', '\r'])(
    'preserves browser path, query, and fragment interpretation for %j',
    (character) => {
      const href = `/a${character}b?q=a${character}b#a${character}b`
      expect(new URL(parseHref(href, undefined).href, baseUrl).href).toBe(
        new URL(href, baseUrl).href,
      )
    },
  )

  test('works', () => {
    const parsed = parseHref('/foo?bar=baz#qux', {} as any)
    expect(parsed.pathname).toEqual('/foo')
    expect(parsed.search).toEqual('?bar=baz')
    expect(parsed.hash).toEqual('#qux')
  })

  describe('open redirect prevention', () => {
    test('strips CR characters to prevent open redirect', () => {
      // If \r (CR) is in the href, it should be stripped
      const parsed = parseHref('/\r/google.com/', undefined)
      expect(parsed.href).toBe('/google.com/')
      expect(parsed.pathname).toBe('/google.com/')
      expect(parsed.href).not.toMatch(/^\/\//)
    })

    test('strips LF characters to prevent open redirect', () => {
      const parsed = parseHref('/\n/evil.com/', undefined)
      expect(parsed.href).toBe('/evil.com/')
      expect(parsed.pathname).toBe('/evil.com/')
      expect(parsed.href).not.toMatch(/^\/\//)
    })

    test('strips CRLF characters to prevent open redirect', () => {
      const parsed = parseHref('/\r\n/evil.com/', undefined)
      expect(parsed.href).toBe('/evil.com/')
      expect(parsed.pathname).toBe('/evil.com/')
      expect(parsed.href).not.toMatch(/^\/\//)
    })

    test('collapses leading double slashes to prevent protocol-relative URLs', () => {
      const parsed = parseHref('//evil.com/path', undefined)
      expect(parsed.href).toBe('/evil.com/path')
      expect(parsed.pathname).toBe('/evil.com/path')
    })

    test('collapses leading backslashes to prevent protocol-relative URLs', () => {
      // Browsers treat backslashes as forward slashes in the authority, so
      // these are equivalent to "//evil.com" and would otherwise redirect.
      for (const href of ['\\\\evil.com/path', '/\\evil.com/path', '\\/evil.com/path']) {
        const parsed = parseHref(href, undefined)
        expect(parsed.pathname).toBe('/evil.com/path')
        const url = new URL(parsed.href, 'http://localhost:3000')
        expect(url.origin).toBe('http://localhost:3000')
      }
    })

    test('sanitized href resolves safely to same origin', () => {
      const parsed = parseHref('/\r/evil.com/', undefined)
      const url = new URL(parsed.href, 'http://localhost:3000')
      expect(url.origin).toBe('http://localhost:3000')
      expect(url.pathname).toBe('/evil.com/')
    })

    test.each([
      '//evil.com/path',
      '///evil.com/path',
      '\x01//evil.com/path',
      '/\t/evil.com/path',
    ])('keeps authority-like path %j on the current origin', (href) => {
      const parsed = parseHref(href, undefined)
      const url = new URL(parsed.href, 'https://victim.example')

      expect(url.origin).toBe('https://victim.example')
    })

    test.each([
      '/\x00/evil.example',
      '\x7f//evil.example',
      '/%5c/evil.example',
      '/%2f/evil.example',
      '?next=//evil.example',
      '#//evil.example',
      '／／evil.example',
      '',
      ' ',
      '\x00',
      '\x00\t\n',
    ])('does not make same-origin input %j cross-origin', (href) => {
      expect(new URL(href, baseUrl).origin).toBe(baseUrl.origin)

      const parsed = parseHref(href, undefined)

      expect(new URL(parsed.href, baseUrl).origin).toBe(baseUrl.origin)
    })

    test('normal paths remain unchanged', () => {
      const parsed = parseHref('/users/profile?id=1#section', undefined)
      expect(parsed.href).toBe('/users/profile?id=1#section')
      expect(parsed.pathname).toBe('/users/profile')
      expect(parsed.search).toBe('?id=1')
      expect(parsed.hash).toBe('#section')
    })
  })
})
