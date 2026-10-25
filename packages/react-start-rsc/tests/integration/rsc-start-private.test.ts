import { describe, expect, test } from 'vitest'
import { openRscPage, startRscDevServer, waitForHydration } from './rsc-app'
import { callFromPage, page } from './rsc-start-page'

describe('Vite dev: a separate RSC provider', () => {
  // J4.2: only server functions client code references are
  // callable over HTTP. `internal` is called by `greet`'s handler only
  // (server origin, allowed); a request by its id from the browser must be
  // refused (R44 in development: the client environment never compiled
  // `internal`'s module, not even when the lookup compiles the client graph
  // on demand).
  // Source: the compiler-level pin was in
  // start-plugin-core/tests/createServerFn/createServerFn.test.ts.
  test(
    'a server function only server code calls is not callable from the browser',
    async () => {
      const server = await startRscDevServer({
        browser: true,
        files: {
          'src/internal.ts': `import { createServerFn } from '@tanstack/react-start'
export const internal = createServerFn().handler(() => 'MARK_INTERNAL')
`,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { internal } from './internal'
export const greet = createServerFn().handler(async () => 'MARK_GREET:' + (await internal()))
`,
          'src/routes/index.tsx': page(`if (typeof window !== 'undefined') {
  ;(window as any).callUrl = async (url: string) => {
    let outcome: { ok: boolean; value: string } | undefined
    let refusal: string | undefined
    // The public caller supplies the real request envelope. Only its URL
    // changes; fetch uses the public .url unchanged, with no id parsing.
    try {
      const value: unknown = await greet({ fetch: async (_input, init) => {
        const response = await fetch(url, init)
        outcome = { ok: response.ok, value: await response.clone().text() }
        return response
      } })
      if (value instanceof Error) { refusal = String(value) }
    } catch (error) {
      if (!outcome) { throw error }
      refusal = String(error)
    }
    return { ...outcome, error: refusal }
  }
}
`),
        },
      })
      const browser = await openRscPage(server, '/')
      await browser.waitForText('label MARK_GREET:MARK_INTERNAL')
      await waitForHydration(browser)
      // The server-origin call works
      await callFromPage(browser, 'called MARK_GREET:MARK_INTERNAL')
      // The id the browser would need (not in the client: the SSR caller
      // knows it)
      const { internal } = await server.import('/src/internal.ts', 'ssr')
      const url = internal.url as string
      expect(typeof url).toBe('string')
      // The same public-URL protocol reaches an exposed function, so a
      // malformed request cannot masquerade as refusal of internal.
      const { greet } = await server.import('/src/fns.ts', 'ssr')
      const positive = await browser.page.evaluate(
        (functionUrl) => (window as any).callUrl(functionUrl),
        greet.url as string,
      )
      expect(positive).toMatchObject({
        ok: true,
        value: expect.stringContaining('MARK_GREET:MARK_INTERNAL'),
      })
      const outcome = await browser.page.evaluate(
        (functionUrl) => (window as any).callUrl(functionUrl),
        url,
      )
      expect(outcome.ok === false || typeof outcome.error === 'string').toBe(
        true,
      )
      const explanation = outcome.error ?? outcome.value
      // Any refusal is allowed, including "not accessible from client".
      expect(explanation).not.toMatch(/TypeError|ReferenceError|SyntaxError/)
      expect(explanation).not.toContain('MARK_INTERNAL')
    },
  )
})
