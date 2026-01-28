import { describe, expect, it } from 'vitest'
import { isDangerousProtocol, DEFAULT_PROTOCOL_BLOCKLIST } from '../src/utils'
import { redirect } from '../src/redirect'

// Create a Set from the default blocklist for testing
const defaultBlocklistSet = new Set(DEFAULT_PROTOCOL_BLOCKLIST)

describe('isDangerousProtocol', () => {
  describe('blocked protocols (in default blocklist)', () => {
    it('should detect javascript: protocol', () => {
      expect(
        isDangerousProtocol('javascript:alert(1)', defaultBlocklistSet),
      ).toBe(true)
    })

    it('should detect javascript: with newlines', () => {
      expect(
        isDangerousProtocol('java\nscript:alert(1)', defaultBlocklistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('java\rscript:alert(1)', defaultBlocklistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('java\tscript:alert(1)', defaultBlocklistSet),
      ).toBe(true)
    })

    it('should detect javascript: with mixed case', () => {
      expect(
        isDangerousProtocol('JavaScript:alert(1)', defaultBlocklistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('JAVASCRIPT:alert(1)', defaultBlocklistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('jAvAsCrIpT:alert(1)', defaultBlocklistSet),
      ).toBe(true)
    })

    it('should detect javascript: with leading whitespace', () => {
      expect(
        isDangerousProtocol(' javascript:alert(1)', defaultBlocklistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('\tjavascript:alert(1)', defaultBlocklistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('\njavascript:alert(1)', defaultBlocklistSet),
      ).toBe(true)
    })

    it('should detect data: protocol', () => {
      expect(
        isDangerousProtocol(
          'data:text/html,<script>alert(1)</script>',
          defaultBlocklistSet,
        ),
      ).toBe(true)
    })

    it('should detect blob: protocol', () => {
      expect(
        isDangerousProtocol(
          'blob:https://example.com/some-uuid',
          defaultBlocklistSet,
        ),
      ).toBe(true)
    })

    it('should detect vbscript: protocol', () => {
      expect(
        isDangerousProtocol('vbscript:msgbox(1)', defaultBlocklistSet),
      ).toBe(true)
    })

    it('should detect file: protocol', () => {
      expect(
        isDangerousProtocol('file:///etc/passwd', defaultBlocklistSet),
      ).toBe(true)
    })

    it('should detect about: protocol', () => {
      expect(isDangerousProtocol('about:blank', defaultBlocklistSet)).toBe(true)
    })

    it('should detect chrome-extension: protocol', () => {
      expect(
        isDangerousProtocol(
          'chrome-extension://abc/page.html',
          defaultBlocklistSet,
        ),
      ).toBe(true)
    })

    it('should detect moz-extension: protocol', () => {
      expect(
        isDangerousProtocol(
          'moz-extension://abc/page.html',
          defaultBlocklistSet,
        ),
      ).toBe(true)
    })

    it('should detect ms-browser-extension: protocol', () => {
      expect(
        isDangerousProtocol(
          'ms-browser-extension://something',
          defaultBlocklistSet,
        ),
      ).toBe(true)
    })

    it('should detect view-source: protocol', () => {
      expect(
        isDangerousProtocol(
          'view-source:https://example.com',
          defaultBlocklistSet,
        ),
      ).toBe(true)
    })
  })

  describe('allowed protocols (not in default blocklist)', () => {
    it('should allow http: protocol', () => {
      expect(
        isDangerousProtocol('http://example.com', defaultBlocklistSet),
      ).toBe(false)
    })

    it('should allow https: protocol', () => {
      expect(
        isDangerousProtocol('https://example.com', defaultBlocklistSet),
      ).toBe(false)
    })

    it('should allow mailto: protocol', () => {
      expect(
        isDangerousProtocol('mailto:user@example.com', defaultBlocklistSet),
      ).toBe(false)
    })

    it('should allow tel: protocol', () => {
      expect(isDangerousProtocol('tel:+1234567890', defaultBlocklistSet)).toBe(
        false,
      )
    })

    it('should allow custom protocols (not in default blocklist)', () => {
      expect(isDangerousProtocol('custom:something', defaultBlocklistSet)).toBe(
        false,
      )
      expect(isDangerousProtocol('foo:bar', defaultBlocklistSet)).toBe(false)
    })
  })

  describe('relative URLs (no protocol)', () => {
    it('should allow relative paths', () => {
      expect(isDangerousProtocol('/path/to/page', defaultBlocklistSet)).toBe(
        false,
      )
      expect(isDangerousProtocol('./relative', defaultBlocklistSet)).toBe(false)
      expect(isDangerousProtocol('../parent', defaultBlocklistSet)).toBe(false)
    })

    it('should allow query strings', () => {
      expect(isDangerousProtocol('?foo=bar', defaultBlocklistSet)).toBe(false)
    })

    it('should allow hash fragments', () => {
      expect(isDangerousProtocol('#section', defaultBlocklistSet)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle empty and null-ish inputs', () => {
      expect(isDangerousProtocol('', defaultBlocklistSet)).toBe(false)
    })

    it('should not be fooled by javascript in pathname', () => {
      expect(
        isDangerousProtocol(
          'https://example.com/javascript:foo',
          defaultBlocklistSet,
        ),
      ).toBe(false)
      expect(isDangerousProtocol('/javascript:foo', defaultBlocklistSet)).toBe(
        false,
      )
    })

    it('should not be fooled by colon in query string', () => {
      expect(isDangerousProtocol('/path?time=12:00', defaultBlocklistSet)).toBe(
        false,
      )
    })
  })

  describe('additional edge cases', () => {
    describe('null and undefined inputs', () => {
      it('should return false for null', () => {
        expect(
          isDangerousProtocol(null as unknown as string, defaultBlocklistSet),
        ).toBe(false)
      })

      it('should return false for undefined', () => {
        expect(
          isDangerousProtocol(
            undefined as unknown as string,
            defaultBlocklistSet,
          ),
        ).toBe(false)
      })
    })

    describe('URL-encoded schemes', () => {
      it('should return false for URL-encoded javascript: protocol (URL constructor does not decode protocol)', () => {
        // %6a%61%76%61%73%63%72%69%70%74 = javascript
        // The URL constructor treats this as an invalid URL (throws), so it returns false
        // This is safe because browsers also don't decode percent-encoding in protocols
        expect(
          isDangerousProtocol(
            '%6a%61%76%61%73%63%72%69%70%74:alert(1)',
            defaultBlocklistSet,
          ),
        ).toBe(false)
      })

      it('should return false for partially URL-encoded javascript: protocol', () => {
        // URL constructor throws for these malformed URLs
        expect(
          isDangerousProtocol('%6aavascript:alert(1)', defaultBlocklistSet),
        ).toBe(false)
        expect(
          isDangerousProtocol('j%61vascript:alert(1)', defaultBlocklistSet),
        ).toBe(false)
      })

      it('should return false for URL-encoded data: protocol', () => {
        // %64%61%74%61 = data
        // URL constructor treats this as invalid
        expect(
          isDangerousProtocol(
            '%64%61%74%61:text/html,<script>alert(1)</script>',
            defaultBlocklistSet,
          ),
        ).toBe(false)
      })

      it('should return false for URL-encoded vbscript: protocol', () => {
        // %76%62%73%63%72%69%70%74 = vbscript
        // URL constructor treats this as invalid
        expect(
          isDangerousProtocol(
            '%76%62%73%63%72%69%70%74:msgbox(1)',
            defaultBlocklistSet,
          ),
        ).toBe(false)
      })

      it('should return false for URL-encoded safe protocols (URL constructor does not decode)', () => {
        // %68%74%74%70%73 = https
        // URL constructor treats this as invalid since percent-encoding in protocol is not decoded
        expect(
          isDangerousProtocol(
            '%68%74%74%70%73://example.com',
            defaultBlocklistSet,
          ),
        ).toBe(false)
      })
    })

    describe('protocol-relative URLs', () => {
      it('should return false for protocol-relative URLs', () => {
        expect(isDangerousProtocol('//example.com', defaultBlocklistSet)).toBe(
          false,
        )
      })

      it('should return false for protocol-relative URLs with paths', () => {
        expect(
          isDangerousProtocol(
            '//example.com/path/to/page',
            defaultBlocklistSet,
          ),
        ).toBe(false)
      })

      it('should return false for protocol-relative URLs with query strings', () => {
        expect(
          isDangerousProtocol('//example.com?foo=bar', defaultBlocklistSet),
        ).toBe(false)
      })

      it('should return false for protocol-relative URLs with hash', () => {
        expect(
          isDangerousProtocol('//example.com#section', defaultBlocklistSet),
        ).toBe(false)
      })
    })

    describe('malformed inputs', () => {
      it('should return false for strings without valid protocol pattern', () => {
        expect(
          isDangerousProtocol('not a url at all', defaultBlocklistSet),
        ).toBe(false)
      })

      it('should return false for strings with only colons', () => {
        expect(isDangerousProtocol(':::', defaultBlocklistSet)).toBe(false)
      })

      it('should return false for strings starting with numbers', () => {
        expect(isDangerousProtocol('123:456', defaultBlocklistSet)).toBe(false)
      })

      it('should handle strings with non-printable characters', () => {
        expect(
          isDangerousProtocol('\x00javascript:alert(1)', defaultBlocklistSet),
        ).toBe(true)
        expect(
          isDangerousProtocol(
            '\x01\x02\x03javascript:alert(1)',
            defaultBlocklistSet,
          ),
        ).toBe(true)
      })

      it('should return false for very long benign paths', () => {
        const longPath = '/' + 'a'.repeat(10000)
        expect(isDangerousProtocol(longPath, defaultBlocklistSet)).toBe(false)
      })

      it('should return false for very long query strings', () => {
        const longQuery = '/path?' + 'a=b&'.repeat(1000)
        expect(isDangerousProtocol(longQuery, defaultBlocklistSet)).toBe(false)
      })

      it('should detect dangerous protocol even with long payload', () => {
        const longPayload = 'javascript:' + 'a'.repeat(10000)
        expect(isDangerousProtocol(longPayload, defaultBlocklistSet)).toBe(true)
      })

      it('should handle unicode characters in URLs', () => {
        expect(
          isDangerousProtocol('/путь/к/странице', defaultBlocklistSet),
        ).toBe(false)
        expect(
          isDangerousProtocol('https://例え.jp/path', defaultBlocklistSet),
        ).toBe(false)
      })

      it('should return false for full-width unicode characters (not recognized as javascript protocol)', () => {
        // Full-width characters are not normalized by URL constructor
        // URL constructor throws, so this is treated as safe (relative URL)
        expect(
          isDangerousProtocol(
            'ｊａｖａｓｃｒｉｐｔ:alert(1)',
            defaultBlocklistSet,
          ),
        ).toBe(false)
      })
    })

    describe('whitespace variations', () => {
      it('should detect javascript: with various whitespace combinations', () => {
        expect(
          isDangerousProtocol(
            '  \t\n  javascript:alert(1)',
            defaultBlocklistSet,
          ),
        ).toBe(true)
        expect(
          isDangerousProtocol('\r\njavascript:alert(1)', defaultBlocklistSet),
        ).toBe(true)
      })

      it('should return false for non-breaking space prefix (URL constructor throws)', () => {
        // Non-breaking space is not stripped by URL constructor, causes it to throw
        expect(
          isDangerousProtocol('\u00A0javascript:alert(1)', defaultBlocklistSet),
        ).toBe(false)
      })

      it('should return false for javascript: with embedded null bytes (URL constructor throws)', () => {
        // Null bytes in the protocol cause URL constructor to throw
        expect(
          isDangerousProtocol('java\x00script:alert(1)', defaultBlocklistSet),
        ).toBe(false)
      })
    })
  })

  describe('custom blocklist', () => {
    it('should use custom blocklist when provided', () => {
      const customBlocklist = new Set(['ftp:', 'ssh:'])
      // Should block ftp: and ssh:
      expect(isDangerousProtocol('ftp://example.com', customBlocklist)).toBe(
        true,
      )
      expect(isDangerousProtocol('ssh://example.com', customBlocklist)).toBe(
        true,
      )
      // Should allow javascript: since it's not in the custom blocklist
      expect(isDangerousProtocol('javascript:alert(1)', customBlocklist)).toBe(
        false,
      )
    })

    it('should allow empty blocklist', () => {
      const emptyBlocklist = new Set<string>()
      expect(isDangerousProtocol('javascript:alert(1)', emptyBlocklist)).toBe(
        false,
      )
      expect(isDangerousProtocol('data:text/html,test', emptyBlocklist)).toBe(
        false,
      )
    })

    it('should allow extending the default blocklist', () => {
      const extendedBlocklist = new Set([
        ...DEFAULT_PROTOCOL_BLOCKLIST,
        'ftp:',
        'gopher:',
      ])
      expect(
        isDangerousProtocol('javascript:alert(1)', extendedBlocklist),
      ).toBe(true)
      expect(isDangerousProtocol('ftp://example.com', extendedBlocklist)).toBe(
        true,
      )
      expect(
        isDangerousProtocol('gopher://example.com', extendedBlocklist),
      ).toBe(true)
      expect(
        isDangerousProtocol('https://example.com', extendedBlocklist),
      ).toBe(false)
    })
  })

  describe('DEFAULT_PROTOCOL_BLOCKLIST', () => {
    it('should contain the expected default protocols', () => {
      expect(DEFAULT_PROTOCOL_BLOCKLIST).toEqual([
        // Script execution protocols
        'javascript:',
        'vbscript:',
        // Local file access
        'file:',
        // Data embedding protocols
        'blob:',
        'data:',
        // Browser internal protocols
        'about:',
        // Platform-specific protocols
        'ms-appx:',
        'ms-appx-web:',
        'ms-browser-extension:',
        'chrome-extension:',
        'moz-extension:',
        // Archive/resource protocols
        'jar:',
        'view-source:',
        'resource:',
        'wyciwyg:',
      ])
    })
  })
})

describe('redirect creation (no protocol validation)', () => {
  it('should allow creating redirect with javascript: protocol', () => {
    // redirect() no longer validates protocols - that happens in resolveRedirect
    expect(() => redirect({ href: 'javascript:alert(1)' })).not.toThrow()
  })

  it('should allow creating redirect with data: protocol', () => {
    expect(() =>
      redirect({ href: 'data:text/html,<script>alert(1)</script>' }),
    ).not.toThrow()
  })

  it('should allow creating redirect with any protocol', () => {
    expect(() => redirect({ href: 'custom:something' })).not.toThrow()
    expect(() =>
      redirect({ href: 'blob:https://example.com/uuid' }),
    ).not.toThrow()
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
