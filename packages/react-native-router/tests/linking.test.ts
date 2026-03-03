import { describe, expect, it } from 'vitest'
import { parseExternalUrl } from '../src/linking'

describe('parseExternalUrl', () => {
  it('parses custom scheme url using prefixes', () => {
    expect(parseExternalUrl('myapp://products/42?ref=test', ['myapp://'])).toBe(
      '/products/42?ref=test',
    )
  })

  it('parses universal links using prefixes', () => {
    expect(
      parseExternalUrl('https://myapp.com/products/42?ref=test#section', [
        'https://myapp.com',
      ]),
    ).toBe('/products/42?ref=test#section')
  })

  it('uses longest matching prefix when multiple prefixes match', () => {
    expect(
      parseExternalUrl('myapp://v2/products/42', ['myapp://', 'myapp://v2']),
    ).toBe('/products/42')
  })

  it('falls back to URL parsing when no prefixes are configured', () => {
    expect(parseExternalUrl('myapp://products/42?ref=test', [])).toBe(
      '/products/42?ref=test',
    )
  })

  it('ignores urls that do not match configured prefixes', () => {
    expect(
      parseExternalUrl('exp://192.168.1.88:8082/--/', ['tanstackrouter://']),
    ).toBeNull()
  })

  it('returns null for invalid urls', () => {
    expect(parseExternalUrl('not a url', [])).toBeNull()
  })
})
