// @vitest-environment node

import { afterEach, describe, expect, test } from 'vitest'
import { isAbsoluteUrl } from '../src/utils'
import { redirect } from '../src/redirect'

const canParseDescriptor = Object.getOwnPropertyDescriptor(URL, 'canParse')!

afterEach(() => {
  Object.defineProperty(URL, 'canParse', canParseDescriptor)
})

describe.each(['native', 'fallback'])(
  'absolute URLs (%s)',
  (implementation) => {
    test.each([
      ['https://example.com/path?q=1#hash', true],
      ['http://localhost:3000/', true],
      ['https://[::1]/', true],
      ['https:example.com', true],
      ['mailto:user@example.com', true],
      ['tel:+123456789', true],
      ['custom:route', true],
      ['javascript:alert(1)', true],
      ['data:text/plain,hello', true],
      ['blob:https://example.com/id', true],
      ['', false],
      ['/', false],
      ['/posts/1', false],
      ['../posts', false],
      ['//example.com/path', false],
      ['?q=1', false],
      ['#hash', false],
      ['/posts/custom:route', false],
      ['http://', false],
      ['https://[::1', false],
      ['https://example.com:99999', false],
      ['https://exa mple.com', false],
    ])('classifies %j and infers redirect reloads', (href, absolute) => {
      if (implementation === 'fallback') {
        Object.defineProperty(URL, 'canParse', { value: undefined })
      }

      expect(isAbsoluteUrl(href)).toBe(absolute)
      expect(redirect({ href }).options.reloadDocument).toBe(
        absolute ? true : undefined,
      )
      expect(
        redirect({ href, reloadDocument: true }).options.reloadDocument,
      ).toBe(true)
    })

    test('accepts whitespace handled by the URL parser', () => {
      if (implementation === 'fallback') {
        Object.defineProperty(URL, 'canParse', { value: undefined })
      }
      expect(isAbsoluteUrl(' \thttps://example.com/\n')).toBe(true)
      expect(isAbsoluteUrl('ht\ttps://example.com/')).toBe(true)
      expect(isAbsoluteUrl('https://例え.テスト/')).toBe(true)
    })
  },
)
