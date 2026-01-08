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
