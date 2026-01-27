import { describe, expect, it } from 'vitest'
import { isDangerousProtocol } from '../src/utils'
import { redirect } from '../src/redirect'

describe('isDangerousProtocol', () => {
  describe('dangerous protocols (not whitelisted)', () => {
    it('should detect javascript: protocol', () => {
      expect(isDangerousProtocol('javascript:alert(1)')).toBe(true)
    })

    it('should detect javascript: with newlines', () => {
      expect(isDangerousProtocol('java\nscript:alert(1)')).toBe(true)
      expect(isDangerousProtocol('java\rscript:alert(1)')).toBe(true)
      expect(isDangerousProtocol('java\tscript:alert(1)')).toBe(true)
    })

    it('should detect javascript: with mixed case', () => {
      expect(isDangerousProtocol('JavaScript:alert(1)')).toBe(true)
      expect(isDangerousProtocol('JAVASCRIPT:alert(1)')).toBe(true)
      expect(isDangerousProtocol('jAvAsCrIpT:alert(1)')).toBe(true)
    })

    it('should detect javascript: with leading whitespace', () => {
      expect(isDangerousProtocol(' javascript:alert(1)')).toBe(true)
      expect(isDangerousProtocol('\tjavascript:alert(1)')).toBe(true)
      expect(isDangerousProtocol('\njavascript:alert(1)')).toBe(true)
    })

    it('should detect data: protocol', () => {
      expect(
        isDangerousProtocol('data:text/html,<script>alert(1)</script>'),
      ).toBe(true)
    })

    it('should detect vbscript: protocol', () => {
      expect(isDangerousProtocol('vbscript:msgbox(1)')).toBe(true)
    })

    it('should detect file: protocol', () => {
      expect(isDangerousProtocol('file:///etc/passwd')).toBe(true)
    })

    it('should detect unknown protocols', () => {
      expect(isDangerousProtocol('custom:something')).toBe(true)
      expect(isDangerousProtocol('foo:bar')).toBe(true)
    })
  })

  describe('safe protocols (whitelisted)', () => {
    it('should allow http: protocol', () => {
      expect(isDangerousProtocol('http://example.com')).toBe(false)
    })

    it('should allow https: protocol', () => {
      expect(isDangerousProtocol('https://example.com')).toBe(false)
    })

    it('should allow mailto: protocol', () => {
      expect(isDangerousProtocol('mailto:user@example.com')).toBe(false)
    })

    it('should allow tel: protocol', () => {
      expect(isDangerousProtocol('tel:+1234567890')).toBe(false)
    })
  })

  describe('relative URLs (no protocol)', () => {
    it('should allow relative paths', () => {
      expect(isDangerousProtocol('/path/to/page')).toBe(false)
      expect(isDangerousProtocol('./relative')).toBe(false)
      expect(isDangerousProtocol('../parent')).toBe(false)
    })

    it('should allow query strings', () => {
      expect(isDangerousProtocol('?foo=bar')).toBe(false)
    })

    it('should allow hash fragments', () => {
      expect(isDangerousProtocol('#section')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle empty and null-ish inputs', () => {
      expect(isDangerousProtocol('')).toBe(false)
    })

    it('should not be fooled by javascript in pathname', () => {
      expect(isDangerousProtocol('https://example.com/javascript:foo')).toBe(
        false,
      )
      expect(isDangerousProtocol('/javascript:foo')).toBe(false)
    })

    it('should not be fooled by colon in query string', () => {
      expect(isDangerousProtocol('/path?time=12:00')).toBe(false)
    })
  })

  describe('additional edge cases', () => {
    describe('null and undefined inputs', () => {
      it('should return false for null', () => {
        expect(isDangerousProtocol(null as unknown as string)).toBe(false)
      })

      it('should return false for undefined', () => {
        expect(isDangerousProtocol(undefined as unknown as string)).toBe(false)
      })
    })

    describe('URL-encoded schemes', () => {
      it('should return false for URL-encoded javascript: protocol (URL constructor does not decode protocol)', () => {
        // %6a%61%76%61%73%63%72%69%70%74 = javascript
        // The URL constructor treats this as an invalid URL (throws), so it returns false
        // This is safe because browsers also don't decode percent-encoding in protocols
        expect(
          isDangerousProtocol('%6a%61%76%61%73%63%72%69%70%74:alert(1)'),
        ).toBe(false)
      })

      it('should return false for partially URL-encoded javascript: protocol', () => {
        // URL constructor throws for these malformed URLs
        expect(isDangerousProtocol('%6aavascript:alert(1)')).toBe(false)
        expect(isDangerousProtocol('j%61vascript:alert(1)')).toBe(false)
      })

      it('should return false for URL-encoded data: protocol', () => {
        // %64%61%74%61 = data
        // URL constructor treats this as invalid
        expect(
          isDangerousProtocol(
            '%64%61%74%61:text/html,<script>alert(1)</script>',
          ),
        ).toBe(false)
      })

      it('should return false for URL-encoded vbscript: protocol', () => {
        // %76%62%73%63%72%69%70%74 = vbscript
        // URL constructor treats this as invalid
        expect(isDangerousProtocol('%76%62%73%63%72%69%70%74:msgbox(1)')).toBe(
          false,
        )
      })

      it('should return false for URL-encoded safe protocols (URL constructor does not decode)', () => {
        // %68%74%74%70%73 = https
        // URL constructor treats this as invalid since percent-encoding in protocol is not decoded
        expect(isDangerousProtocol('%68%74%74%70%73://example.com')).toBe(false)
      })
    })

    describe('protocol-relative URLs', () => {
      it('should return false for protocol-relative URLs', () => {
        expect(isDangerousProtocol('//example.com')).toBe(false)
      })

      it('should return false for protocol-relative URLs with paths', () => {
        expect(isDangerousProtocol('//example.com/path/to/page')).toBe(false)
      })

      it('should return false for protocol-relative URLs with query strings', () => {
        expect(isDangerousProtocol('//example.com?foo=bar')).toBe(false)
      })

      it('should return false for protocol-relative URLs with hash', () => {
        expect(isDangerousProtocol('//example.com#section')).toBe(false)
      })
    })

    describe('malformed inputs', () => {
      it('should return false for strings without valid protocol pattern', () => {
        expect(isDangerousProtocol('not a url at all')).toBe(false)
      })

      it('should return false for strings with only colons', () => {
        expect(isDangerousProtocol(':::')).toBe(false)
      })

      it('should return false for strings starting with numbers', () => {
        expect(isDangerousProtocol('123:456')).toBe(false)
      })

      it('should handle strings with non-printable characters', () => {
        expect(isDangerousProtocol('\x00javascript:alert(1)')).toBe(true)
        expect(isDangerousProtocol('\x01\x02\x03javascript:alert(1)')).toBe(
          true,
        )
      })

      it('should return false for very long benign paths', () => {
        const longPath = '/' + 'a'.repeat(10000)
        expect(isDangerousProtocol(longPath)).toBe(false)
      })

      it('should return false for very long query strings', () => {
        const longQuery = '/path?' + 'a=b&'.repeat(1000)
        expect(isDangerousProtocol(longQuery)).toBe(false)
      })

      it('should detect dangerous protocol even with long payload', () => {
        const longPayload = 'javascript:' + 'a'.repeat(10000)
        expect(isDangerousProtocol(longPayload)).toBe(true)
      })

      it('should handle unicode characters in URLs', () => {
        expect(isDangerousProtocol('/путь/к/странице')).toBe(false)
        expect(isDangerousProtocol('https://例え.jp/path')).toBe(false)
      })

      it('should return false for full-width unicode characters (not recognized as javascript protocol)', () => {
        // Full-width characters are not normalized by URL constructor
        // URL constructor throws, so this is treated as safe (relative URL)
        expect(isDangerousProtocol('ｊａｖａｓｃｒｉｐｔ:alert(1)')).toBe(false)
      })
    })

    describe('whitespace variations', () => {
      it('should detect javascript: with various whitespace combinations', () => {
        expect(isDangerousProtocol('  \t\n  javascript:alert(1)')).toBe(true)
        expect(isDangerousProtocol('\r\njavascript:alert(1)')).toBe(true)
      })

      it('should return false for non-breaking space prefix (URL constructor throws)', () => {
        // Non-breaking space is not stripped by URL constructor, causes it to throw
        expect(isDangerousProtocol('\u00A0javascript:alert(1)')).toBe(false)
      })

      it('should return false for javascript: with embedded null bytes (URL constructor throws)', () => {
        // Null bytes in the protocol cause URL constructor to throw
        expect(isDangerousProtocol('java\x00script:alert(1)')).toBe(false)
      })
    })
  })
})

describe('redirect with dangerous protocols', () => {
  it('should throw when href uses javascript: protocol', () => {
    expect(() => redirect({ href: 'javascript:alert(1)' })).toThrow(
      /unsafe protocol/,
    )
  })

  it('should throw when href uses javascript: with bypass attempts', () => {
    expect(() => redirect({ href: 'java\nscript:alert(1)' })).toThrow(
      /unsafe protocol/,
    )
    expect(() => redirect({ href: 'JavaScript:alert(1)' })).toThrow(
      /unsafe protocol/,
    )
  })

  it('should throw when href uses data: protocol', () => {
    expect(() =>
      redirect({ href: 'data:text/html,<script>alert(1)</script>' }),
    ).toThrow(/unsafe protocol/)
  })

  it('should allow safe protocols', () => {
    expect(() => redirect({ href: 'https://example.com' })).not.toThrow()
    expect(() => redirect({ href: 'http://example.com' })).not.toThrow()
    expect(() => redirect({ href: 'mailto:user@example.com' })).not.toThrow()
  })

  it('should allow redirects without href', () => {
    expect(() => redirect({ to: '/home' })).not.toThrow()
  })
})
