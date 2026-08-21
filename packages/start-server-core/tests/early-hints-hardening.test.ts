import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { serializeEarlyHint } from '../src/early-hints'

/**
 * Early Hints are emitted as HTTP `Link` headers. Attribute values come from
 * the asset manifest / route `head` config (developer-controlled today), but
 * a hostile value must still not be able to forge additional Link params.
 * The contract enforced by buildLinkParam:
 * - token-safe values are emitted unquoted
 * - everything else is emitted as a JSON quoted-string (no raw quotes/`;`)
 * - href is interpolated between <...> as-is (manifest-controlled; documented)
 */

// [hint property key, wire param name]
const paramNames = [
  ['as', 'as'],
  ['type', 'type'],
  ['integrity', 'integrity'],
  ['referrerPolicy', 'referrerpolicy'],
  ['fetchPriority', 'fetchpriority'],
] as const

describe('serializeEarlyHint injection resistance', () => {
  it('token values pass through; non-token values become quoted strings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...paramNames),
        fc.string({ maxLength: 60 }),
        ([key, name], value) => {
          const hint = { rel: 'preload', href: '/x.js', [key]: value }
          const out = serializeEarlyHint(hint as any)
          const tokenRe = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

          if (value !== '' && tokenRe.test(value)) {
            // safe token: emitted verbatim
            expect(out).toContain(`${name}=${value}`)
          } else {
            // falsy values are omitted; non-token values MUST be quoted.
            // Invariant: every occurrence of `name=` is either inside a
            // quoted section or immediately followed by the opening quote.
            const outsideQuotes = out.replace(/"(?:[^"\\]|\\.)*"/g, '')
            expect(outsideQuotes).not.toMatch(new RegExp(`${name}=[^"]`))
          }
        },
      ),
    )
  })

  it('a hostile attribute value cannot forge extra Link parameters', () => {
    const evil = 'preload; rel=stylesheet; foo=bar'
    const out = serializeEarlyHint({
      rel: 'preload',
      href: '/x.js',
      integrity: evil,
    } as any)
    // the hostile string only appears inside the quoted integrity value;
    // everything outside quoted sections must be free of injected params
    const outsideQuotes = out.replace(/"(?:[^"\\]|\\.)*"/g, '')
    expect(outsideQuotes).not.toContain('rel=stylesheet')
    expect(outsideQuotes).not.toContain('foo=bar')
  })

  it('undefined optional params are omitted, falsy crossorigin normalizes', () => {
    const out = serializeEarlyHint({ rel: 'preload', href: '/a.js' } as any)
    expect(out).toBe('</a.js>; rel=preload')

    const out2 = serializeEarlyHint({
      rel: 'preload',
      href: '/a.js',
      crossOrigin: '',
    } as any)
    expect(out2).toContain('crossorigin')
  })

  it('DOCUMENTED QUIRK: href is not sanitized (manifest-controlled input)', () => {
    // href originates from the asset manifest, not request input. If that
    // ever changes to include user data, this interpolation between <...>
    // becomes a header-injection vector and must gain escaping first.
    const out = serializeEarlyHint({
      rel: 'preload',
      href: '/a b.js; rel=evil',
    } as any)
    expect(out).toContain('</a b.js; rel=evil>')
  })
})
