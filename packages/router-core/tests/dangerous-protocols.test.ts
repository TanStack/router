import { createBrowserHistory, createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROTOCOL_ALLOWLIST, isDangerousProtocol } from '../src/utils'
import { redirect } from '../src/redirect'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

const defaultAllowlistSet = new Set(DEFAULT_PROTOCOL_ALLOWLIST)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isDangerousProtocol', () => {
  describe('blocked protocols (not in default allowlist)', () => {
    it('should detect javascript: protocol', () => {
      expect(
        isDangerousProtocol('javascript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
    })

    it('should detect javascript: with mixed case and whitespace', () => {
      expect(
        isDangerousProtocol('JavaScript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('  \t\n  javascript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('java\nscript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
    })

    it('should detect known unsafe schemes', () => {
      expect(
        isDangerousProtocol(
          'data:text/html,<script>alert(1)</script>',
          defaultAllowlistSet,
        ),
      ).toBe(true)
      expect(
        isDangerousProtocol(
          'blob:https://example.com/some-uuid',
          defaultAllowlistSet,
        ),
      ).toBe(true)
      expect(
        isDangerousProtocol('vbscript:msgbox(1)', defaultAllowlistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('file:///etc/passwd', defaultAllowlistSet),
      ).toBe(true)
      expect(isDangerousProtocol('about:blank', defaultAllowlistSet)).toBe(true)
    })

    it('should block custom protocols by default', () => {
      expect(isDangerousProtocol('custom:something', defaultAllowlistSet)).toBe(
        true,
      )
      expect(isDangerousProtocol('foo:bar', defaultAllowlistSet)).toBe(true)
    })
  })

  describe('allowed protocols (in default allowlist)', () => {
    it('should allow http and https', () => {
      expect(
        isDangerousProtocol('http://example.com', defaultAllowlistSet),
      ).toBe(false)
      expect(
        isDangerousProtocol('https://example.com', defaultAllowlistSet),
      ).toBe(false)
    })

    it('should allow mailto and tel', () => {
      expect(
        isDangerousProtocol('mailto:user@example.com', defaultAllowlistSet),
      ).toBe(false)
      expect(isDangerousProtocol('tel:+1234567890', defaultAllowlistSet)).toBe(
        false,
      )
    })
  })

  describe('relative URLs (no protocol)', () => {
    it('should allow relative paths, query strings and hash fragments', () => {
      expect(isDangerousProtocol('/path/to/page', defaultAllowlistSet)).toBe(
        false,
      )
      expect(isDangerousProtocol('./relative', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('../parent', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('?foo=bar', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('#section', defaultAllowlistSet)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle empty and null-ish inputs', () => {
      expect(isDangerousProtocol('', defaultAllowlistSet)).toBe(false)
      expect(
        isDangerousProtocol(null as unknown as string, defaultAllowlistSet),
      ).toBe(false)
      expect(
        isDangerousProtocol(
          undefined as unknown as string,
          defaultAllowlistSet,
        ),
      ).toBe(false)
    })

    it('should not be fooled by javascript in pathname or query', () => {
      expect(
        isDangerousProtocol(
          'https://example.com/javascript:foo',
          defaultAllowlistSet,
        ),
      ).toBe(false)
      expect(isDangerousProtocol('/javascript:foo', defaultAllowlistSet)).toBe(
        false,
      )
      expect(isDangerousProtocol('/path?time=12:00', defaultAllowlistSet)).toBe(
        false,
      )
    })

    it('should return false for malformed/encoded scheme strings that URL rejects', () => {
      expect(
        isDangerousProtocol(
          '%6a%61%76%61%73%63%72%69%70%74:alert(1)',
          defaultAllowlistSet,
        ),
      ).toBe(false)
      expect(isDangerousProtocol(':::', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('123:456', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('//example.com', defaultAllowlistSet)).toBe(
        false,
      )
    })

    it('should detect dangerous protocol with leading control characters', () => {
      expect(
        isDangerousProtocol('\x00javascript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol(
          '\x01\x02\x03javascript:alert(1)',
          defaultAllowlistSet,
        ),
      ).toBe(true)
    })
  })

  describe('custom allowlist', () => {
    it('should use custom allowlist when provided', () => {
      const customAllowlist = new Set(['ftp:', 'ssh:'])

      expect(isDangerousProtocol('ftp://example.com', customAllowlist)).toBe(
        false,
      )
      expect(isDangerousProtocol('ssh://example.com', customAllowlist)).toBe(
        false,
      )
      expect(isDangerousProtocol('javascript:alert(1)', customAllowlist)).toBe(
        true,
      )
      expect(isDangerousProtocol('https://example.com', customAllowlist)).toBe(
        true,
      )
    })

    it('should block absolute URLs with an empty allowlist', () => {
      const emptyAllowlist = new Set<string>()
      expect(isDangerousProtocol('javascript:alert(1)', emptyAllowlist)).toBe(
        true,
      )
      expect(isDangerousProtocol('data:text/html,test', emptyAllowlist)).toBe(
        true,
      )
      expect(isDangerousProtocol('https://example.com', emptyAllowlist)).toBe(
        true,
      )
    })

    it('should allow extending the default allowlist', () => {
      const extendedAllowlist = new Set([
        ...DEFAULT_PROTOCOL_ALLOWLIST,
        'ftp:',
        'gopher:',
      ])

      expect(
        isDangerousProtocol('javascript:alert(1)', extendedAllowlist),
      ).toBe(true)
      expect(isDangerousProtocol('ftp://example.com', extendedAllowlist)).toBe(
        false,
      )
      expect(
        isDangerousProtocol('gopher://example.com', extendedAllowlist),
      ).toBe(false)
      expect(
        isDangerousProtocol('https://example.com', extendedAllowlist),
      ).toBe(false)
    })
  })

  describe('DEFAULT_PROTOCOL_ALLOWLIST', () => {
    it('should contain the expected default protocols', () => {
      expect(DEFAULT_PROTOCOL_ALLOWLIST).toEqual([
        'http:',
        'https:',
        'mailto:',
        'tel:',
      ])
    })
  })
})

describe('redirect creation (no protocol validation)', () => {
  it('should allow creating redirect with javascript: protocol', () => {
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

describe('public navigation and redirect sinks', () => {
  const customProtocols = [
    'x-safari-https://example.com',
    'googlechromes://example.com',
    'intent://example.com#Intent;scheme=https;end',
    'foo:bar',
  ]

  it.each(customProtocols)(
    'document-navigates to allowlisted protocol %j',
    async (href) => {
      const windowLocation = { href: '', replace: vi.fn() }
      vi.stubGlobal('window', { location: windowLocation })
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        origin: 'https://victim.example',
        protocolAllowlist: [
          'x-safari-https:',
          'googlechromes:',
          'intent:',
          'foo:',
        ],
        isServer: false,
      })

      await router.navigate({ href, reloadDocument: true })

      expect(windowLocation.href).toBe(href)
    },
  )

  it.each(customProtocols)(
    'blocks unsafe document destination %j',
    async (href) => {
      const windowLocation = { href: '', replace: vi.fn() }
      vi.stubGlobal('window', { location: windowLocation })
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        origin: 'https://victim.example',
        isServer: false,
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      try {
        for (const replace of [false, true]) {
          await router.navigate({ href, reloadDocument: true, replace })

          expect(windowLocation.href).toBe('')
          expect(windowLocation.replace).not.toHaveBeenCalled()
          expect(router.history.location.href).toBe('/')
          expect(warn).toHaveBeenCalledWith(
            `Blocked navigation to dangerous protocol: ${href}`,
          )
        }
      } finally {
        warn.mockRestore()
      }
    },
  )

  it('uses a safe explicit Location instead of a stale external href', async () => {
    const rootRoute = new BaseRootRoute()
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () =>
        redirect({
          href: 'https://other.example/ignored',
          headers: { Location: '/safe' },
        }),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute]),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/source')

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/safe')
  })

  it.each([{ blocked: false, ignoreBlocker: false, unsafe: true }])(
    'only exempts an accepted document navigation from beforeunload: %j',
    async ({ blocked, ignoreBlocker, unsafe }) => {
      const browserWindow = window
      const history = createBrowserHistory({ window: browserWindow })
      const firstBlocker = vi.fn(async () => false)
      const lastBlocker = vi.fn(async () => blocked)
      history.block({ blockerFn: firstBlocker, enableBeforeUnload: true })
      history.block({ blockerFn: lastBlocker, enableBeforeUnload: true })
      const windowLocation = { href: '', replace: vi.fn() }
      vi.stubGlobal('window', { location: windowLocation })
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history,
        origin: 'https://victim.example',
        isServer: false,
      })
      const href = unsafe
        ? 'javascript:alert(1)'
        : 'https://other.example/target'

      try {
        await router.navigate({ href, ignoreBlocker })

        const accepted = !unsafe && (ignoreBlocker || !blocked)
        expect(windowLocation.href).toBe(accepted ? href : '')
        expect(firstBlocker).toHaveBeenCalledTimes(
          ignoreBlocker || unsafe ? 0 : 1,
        )
        expect(lastBlocker).toHaveBeenCalledTimes(
          ignoreBlocker || unsafe ? 0 : 1,
        )

        const beforeUnload = new Event('beforeunload', { cancelable: true })
        browserWindow.dispatchEvent(beforeUnload)
        expect(beforeUnload.defaultPrevented).toBe(!accepted)

        // The exemption must not carry over to a later navigation.
        const nextBeforeUnload = new Event('beforeunload', {
          cancelable: true,
        })
        browserWindow.dispatchEvent(nextBeforeUnload)
        expect(nextBeforeUnload.defaultPrevented).toBe(true)
      } finally {
        history.destroy()
      }
    },
  )
})

describe('integration test on Router', () => {
  const inputs = [
    'x-safari-https://example.com',
    'googlechromes://example.com',
    'intent://example.com#Intent;scheme=https;end',
    'foo:bar',
  ]
  it('should accept weird protocols from the allowlist', () => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      protocolAllowlist: [
        'x-safari-https:',
        'googlechromes:',
        'intent:',
        'foo:',
      ],
    })
    // Each protocol in the inputs should be accepted by resolveRedirect
    for (const href of inputs) {
      const redir = redirect({ href })
      expect(() => router.resolveRedirect(redir)).not.toThrow()
    }
  })
  it('should block weird protocols not in the allowlist', () => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      protocolAllowlist: [],
    })
    // Each protocol in the inputs should be blocked by resolveRedirect
    for (const href of inputs) {
      const redir = redirect({ href })
      expect(() => router.resolveRedirect(redir)).toThrow(
        /Redirect blocked: unsafe protocol/,
      )
    }
  })
})
