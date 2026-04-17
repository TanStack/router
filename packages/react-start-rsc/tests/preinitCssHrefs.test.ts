import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom'

import { _internals, preinitCssHrefs } from '../src/preinitCssHrefs'

describe('HMR_CACHE_BUST', () => {
  const { HMR_CACHE_BUST } = _internals

  it.each([
    '/src/components/Card.css?t=1776450256042',
    '/assets/app.css?v=abc&t=123',
    '/a.css?t=0',
  ])('matches Vite HMR cache-bust hrefs (%s)', (href) => {
    expect(HMR_CACHE_BUST.test(href)).toBe(true)
  })

  it.each([
    '/src/components/Card.css',
    '/assets/app.css?v=abc',
    '/a.Card.abc123.css',
    '/a.css?theme=dark',
    // `t=` without digits (not a Vite cache-bust)
    '/a.css?t=abc',
    // `t=` as a substring of a larger param name
    '/a.css?format=3',
  ])('does not match non-cache-busted hrefs (%s)', (href) => {
    expect(HMR_CACHE_BUST.test(href)).toBe(false)
  })
})

describe('preinitCssHrefs', () => {
  let preinitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    preinitSpy = vi.spyOn(ReactDOM, 'preinit').mockImplementation(() => {})
  })

  afterEach(() => {
    preinitSpy.mockRestore()
  })

  it('preinits non-cache-busted hrefs with {as:"style", precedence:"high"}', () => {
    preinitCssHrefs(['/assets/app.abc123.css'])
    expect(preinitSpy).toHaveBeenCalledTimes(1)
    expect(preinitSpy).toHaveBeenCalledWith('/assets/app.abc123.css', {
      as: 'style',
      precedence: 'high',
    })
  })

  it('skips hrefs matching the HMR cache-bust pattern', () => {
    preinitCssHrefs([
      '/src/components/Card.css?t=1776450256042',
      '/assets/app.css?v=abc&t=123',
    ])
    expect(preinitSpy).not.toHaveBeenCalled()
  })

  it('preinits only the non-cache-busted subset from a mixed list', () => {
    preinitCssHrefs([
      '/a.css?t=1',
      '/b.Card.abc.css',
      '/c.css?t=2',
      '/d.css?theme=dark',
    ])
    expect(preinitSpy).toHaveBeenCalledTimes(2)
    expect(preinitSpy).toHaveBeenNthCalledWith(1, '/b.Card.abc.css', {
      as: 'style',
      precedence: 'high',
    })
    expect(preinitSpy).toHaveBeenNthCalledWith(2, '/d.css?theme=dark', {
      as: 'style',
      precedence: 'high',
    })
  })

  it.each([undefined, [], new Set<string>()])(
    'is a no-op for empty or missing input (%#)',
    (input) => {
      preinitCssHrefs(input)
      expect(preinitSpy).not.toHaveBeenCalled()
    },
  )

  it('accepts a ReadonlySet<string> (the actual call-site type)', () => {
    const hrefs: ReadonlySet<string> = new Set(['/a.css?t=1', '/b.abc.css'])
    preinitCssHrefs(hrefs)
    expect(preinitSpy).toHaveBeenCalledTimes(1)
    expect(preinitSpy).toHaveBeenCalledWith('/b.abc.css', {
      as: 'style',
      precedence: 'high',
    })
  })
})
