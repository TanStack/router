import { describe, expectTypeOf, test } from 'vitest'
import type { ExternalUrl, ToPathOption } from '../src/link'

// Regression coverage for https://github.com/TanStack/router/issues/4901.
// `to` on `Link`/`createLink`/`linkOptions` should accept absolute external
// URLs (https, mailto, tel, http) in addition to internal route paths.
describe('ExternalUrl', () => {
  test('matches https URLs', () => {
    expectTypeOf<'https://example.com'>().toMatchTypeOf<ExternalUrl>()
    expectTypeOf<'https://example.com/path?query=1#hash'>().toMatchTypeOf<ExternalUrl>()
  })

  test('matches http URLs', () => {
    expectTypeOf<'http://example.com'>().toMatchTypeOf<ExternalUrl>()
  })

  test('matches mailto: URLs', () => {
    expectTypeOf<'mailto:user@example.com'>().toMatchTypeOf<ExternalUrl>()
  })

  test('matches tel: URLs', () => {
    expectTypeOf<'tel:+15551234567'>().toMatchTypeOf<ExternalUrl>()
  })

  test('rejects internal route paths (no scheme)', () => {
    // Without a scheme these are NOT external URLs.
    expectTypeOf<'/dashboard'>().not.toMatchTypeOf<ExternalUrl>()
    expectTypeOf<'../profile'>().not.toMatchTypeOf<ExternalUrl>()
  })
})

describe('ToPathOption', () => {
  test('accepts absolute external URLs', () => {
    // Default generics: no specific router/type constraints.
    // `to` should now accept any ExternalUrl.
    expectTypeOf<'https://example.com'>().toMatchTypeOf<ToPathOption>()
    expectTypeOf<'mailto:user@example.com'>().toMatchTypeOf<ToPathOption>()
    expectTypeOf<'tel:+15551234567'>().toMatchTypeOf<ToPathOption>()
  })

  test('still accepts internal route paths', () => {
    // Backward compat: internal paths must remain assignable to `to`.
    expectTypeOf<string>().toMatchTypeOf<ToPathOption>()
  })
})