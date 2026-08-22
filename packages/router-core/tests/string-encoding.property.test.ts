import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { decodePath, encodePathParam, escapeHtml } from '../src/string-encoding'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'
import { interpolatePath } from '../src/path'
import { decode as decodeQueryString } from '../src/qss'

/**
 * Property-based invariants for the string encoding boundary.
 *
 * Each property here encodes a guarantee documented in
 * src/string-encoding.ts. If one of these fails, the guarantee is broken —
 * fix the implementation or consciously change the documented contract.
 */

/** Strings with percent-encoding fragments and control characters injected. */
const mangledStringArb = fc
  .array(
    fc.oneof(
      fc.string(),
      fc.constantFrom('%', '%25', '%zz', '%E4%BD', '%2F', '%00', '%0d', '%0a'),
      fc.constantFrom('\r', '\n', '\x00', '\x7f', '<', '>', '"', '`', '{', '}'),
      fc.constantFrom('//', '/evil.com'),
    ),
    { maxLength: 12 },
  )
  .map((parts) => parts.join(''))

/** True if the string contains lone (unpaired) UTF-16 surrogates. */
function hasLoneSurrogates(s: string): boolean {
  const withoutPairs = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
  return /[\uD800-\uDFFF]/.test(withoutPairs)
}

// Values containing lone surrogates are excluded: encodeURIComponent itself
// does not round-trip those (it produces %ED%A0%80-style sequences that its
// own decoder rejects), and the router treats them as malformed — no match.
const roundTripValueArb = fc.string().filter((s) => !hasLoneSurrogates(s))

/** Native decode, or null when the input is malformed (incl. lone surrogates). */
function nativeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

describe('encodePathParam properties', () => {
  it('round-trips through decodeURIComponent for any value', () => {
    fc.assert(
      fc.property(roundTripValueArb, (value) => {
        expect(decodeURIComponent(encodePathParam(value))).toBe(value)
      }),
    )
  })

  it('output never contains raw separators (?, #) or control characters', () => {
    fc.assert(
      fc.property(roundTripValueArb, (value) => {
        const encoded = encodePathParam(value)
        // eslint-disable-next-line no-control-regex
        expect(encoded).not.toMatch(/[?#\r\n\0]/)
      }),
    )
  })
})

describe('matcher integration properties', () => {
  const tree = processRouteTree({
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    path: '/',
    children: [
      { id: '/$id', fullPath: '/$id', path: '$id' },
      { id: '/files/$', fullPath: '/files/$', path: 'files/$' },
      { id: '/files/*', fullPath: '/files/*', path: 'files/*' },
    ],
  }).processedTree

  it('matching is total: never throws for any path', () => {
    fc.assert(
      fc.property(mangledStringArb, (path) => {
        const prefixed = `/${path.replace(/^\//, '')}`
        expect(() => findRouteMatch(prefixed, tree)).not.toThrow()
        expect(() => findRouteMatch(prefixed, tree, true)).not.toThrow()
      }),
    )
  })

  it('recovers a param value exactly after encode → decodePath → match', () => {
    fc.assert(
      fc.property(
        roundTripValueArb.filter((v) => v !== '' && !v.includes('/')),
        (value) => {
          const { interpolatedPath } = interpolatePath({
            path: '/$id',
            params: { id: value },
          })
          const decoded = decodePath(interpolatedPath).path
          const match = findRouteMatch(decoded, tree)
          // whenever the value survives a native encode/decode cycle the router
          // must recover it exactly; otherwise it must be treated as no-match
          if (nativeDecode(encodeURIComponent(value)) === value) {
            expect(match?.rawParams?.id).toBe(value)
          } else {
            expect(match).toBeNull()
          }
        },
      ),
    )
  })

  // KNOWN PRE-EXISTING QUIRK (documented, not fixed here): a splat value of
  // `*` interpolates to `/files/*`, which collides with the legacy `*`
  // wildcard syntax and therefore does not round-trip. Values containing `*`
  // are excluded from the property below; if you fix the collision, remove
  // the filter and this note.
  it('splat params preserve slashes and round-trip', () => {
    fc.assert(
      fc.property(
        roundTripValueArb.filter(
          (v) =>
            v !== '' &&
            !v.startsWith('/') &&
            !v.endsWith('/') &&
            !v.includes('*'),
        ),
        (value) => {
          const { interpolatedPath } = interpolatePath({
            path: '/files/$',
            params: { _splat: value },
          })
          const decoded = decodePath(interpolatedPath).path
          const match = findRouteMatch(decoded, tree)
          if (nativeDecode(encodeURIComponent(value)) === value) {
            expect(match?.rawParams?._splat).toBe(value)
          } else {
            expect(match).toBeNull()
          }
        },
      ),
    )
  })
})

describe('decodePath properties', () => {
  it('is total: never throws for any input', () => {
    fc.assert(
      fc.property(mangledStringArb, (path) => {
        expect(() => decodePath(path)).not.toThrow()
      }),
    )
  })

  it('never returns a protocol-relative path (open-redirect defense)', () => {
    fc.assert(
      fc.property(mangledStringArb, (path) => {
        const { path: result } = decodePath(path)
        expect(result.startsWith('//')).toBe(false)
      }),
    )
  })

  it('never introduces unsafe characters that were not already literal in the input', () => {
    // Characters like `"`, `<`, `>`, control chars must stay percent-encoded
    // after a decode round. Literal occurrences in the input pass through
    // untouched (browsers percent-encode them anyway before they reach the
    // router); decoding must never *create* new ones.
    fc.assert(
      fc.property(mangledStringArb, (path) => {
        const { path: result } = decodePath(path)
        const unsafeRe = /[\x00-\x1f\x7f"<>`{}]/g
        const inputUnsafe = new Set(path.match(unsafeRe) ?? [])
        for (const ch of result.match(unsafeRe) ?? []) {
          expect(inputUnsafe.has(ch)).toBe(true)
        }
      }),
    )
  })
})

describe('escapeHtml properties', () => {
  it('output cannot break out of a <script> text context', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const escaped = escapeHtml(JSON.stringify(value))
        expect(escaped).not.toMatch(/[<>&]/)
        expect(escaped.toLowerCase()).not.toContain('</script')
        expect(escaped).not.toMatch(/[\u2028\u2029]/)
      }),
    )
  })

  it('is injective enough for embedding: distinct values stay distinct', () => {
    // escaping must never map two different JSON payloads to the same output,
    // otherwise SSR'd data could be swapped by crafting input values
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        if (a === b) return
        expect(escapeHtml(JSON.stringify(a))).not.toBe(
          escapeHtml(JSON.stringify(b)),
        )
      }),
    )
  })
})

describe('search param decoding properties', () => {
  it('decode always returns a null-prototype object (prototype-pollution defense)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.string(), fc.string()), { maxLength: 8 }),
        (entries) => {
          const qs = entries
            .map(
              ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
            )
            .join('&')
          const result = decodeQueryString(qs)
          expect(Object.getPrototypeOf(result)).toBe(null)
        },
      ),
    )
  })

  it('__proto__ keys never pollute Object.prototype', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 5 }),
        fc.string(),
        (suffixValues, value) => {
          const qs = ['__proto__=' + encodeURIComponent(value)]
            .concat(suffixValues.map((v) => `${encodeURIComponent(v)}=1`))
            .join('&')
          const result = decodeQueryString(qs) as Record<string, unknown>
          const polluted = (Object.prototype as Record<string, unknown>)
            .polluted
          expect(polluted).toBeUndefined()
          expect(({} as Record<string, unknown>).polluted).toBeUndefined()
          // the key is still readable as own property data
          expect(
            Object.getOwnPropertyDescriptor(result, '__proto__'),
          ).toBeDefined()
        },
      ),
    )
  })
})
