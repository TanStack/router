import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getScrollRestorationScriptForRouter } from '../src/scroll-restoration-script/server'
import { BaseRootRoute, BaseRoute, storageKey } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * The scroll restoration script interpolates a user-supplied `getKey` value
 * into an inline <script> during SSR. escapeHtml(JSON.stringify(key)) is the
 * XSS mitigation; these tests verify it holds for adversarial inputs AND
 * that escaping stays semantically transparent (the script must restore the
 * exact original key, not just "look safe").
 */

function createScrollRestorationRouter(getScrollRestorationKey: () => string) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
    scrollRestoration: true,
    getScrollRestorationKey,
  })
}

afterEach(() => {
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe('scroll restoration script XSS resistance', () => {
  const maliciousKeys = [
    '</script><script>alert(1)</script>',
    '"}; alert(1); {"',
    "'+alert(1)+'",
    "\\'; alert(1); \\'",
    'key\u2028with\u2029separators',
    '${alert(1)}',
    '<img src=x onerror=alert(1)>',
  ]

  test.each(maliciousKeys)(
    'script for key %j contains no context-breaking sequences',
    (key) => {
      const router = createScrollRestorationRouter(() => key)
      const script = getScrollRestorationScriptForRouter(router)!
      // nothing may close/reopen the surrounding <script> tag
      expect(script.toLowerCase()).not.toContain('</script')
      expect(script.toLowerCase()).not.toContain('<script')
      // U+2028/U+2029 are line terminators inside JS strings; must be escaped
      expect(script).not.toMatch(/[\u2028\u2029]/)
      // eslint-disable-next-line no-control-regex
      expect(script).not.toMatch(/[\x00-\x1f\x7f]/)
    },
  )

  test.each(maliciousKeys)(
    'script for key %j restores scroll state stored under the exact key',
    (key) => {
      const router = createScrollRestorationRouter(() => key)
      const script = getScrollRestorationScriptForRouter(router)!

      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ [key]: { window: { scrollX: 11, scrollY: 22 } } }),
      )
      const scrollTo = vi.fn()
      vi.stubGlobal('scrollTo', scrollTo)

      expect(() => new Function(script)()).not.toThrow()
      // proves the escaped key round-tripped to exactly the original value:
      // the inline script found our entry and scrolled
      expect(scrollTo).toHaveBeenCalledWith(11, 22)
    },
  )

  test('injected code inside a key is never executed', () => {
    // if escaping were broken, this key would terminate the string literal
    // and execute alert() during script evaluation
    let executed = false
    const router = createScrollRestorationRouter(() => '"}; alert(1); {"')
    const script = getScrollRestorationScriptForRouter(router)!
    vi.stubGlobal('alert', () => {
      executed = true
    })
    new Function(script)()
    expect(executed).toBe(false)
  })
})

describe('seroval stream factory canary', () => {
  // FACTORY_BINARY / FACTORY_TEXT are static minified JS shipped into inline
  // scripts and evaluated client-side. They must never gain interpolation
  // points - any future `${...}` or concatenation with non-literal data would
  // become an eval-injection sink.
  const src = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../src/ssr/serializer/RawStream.ts',
    ),
    'utf8',
  )

  function extractFactory(name: string): string {
    const match = src.match(new RegExp(`${name}\\s*=\\s*([\\s\\S]*?)\\n`))
    expect(match, `${name} not found in RawStream.ts`).not.toBeNull()
    return match![1]!
  }

  test.each(['FACTORY_BINARY', 'FACTORY_TEXT'])(
    '%s contains no interpolation points',
    (name) => {
      const literal = extractFactory(name)
      expect(literal.startsWith('`')).toBe(true)
      expect(literal).not.toContain('${')
      expect(literal).not.toContain("' +")
      expect(literal).not.toContain('+ `')
    },
  )
})
