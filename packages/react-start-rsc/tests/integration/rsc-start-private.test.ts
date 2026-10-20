import { describe, expect, test } from 'vitest'
import { openRscPage, startRscDevServer, waitForHydration } from './rsc-app'
import { callFromPage, page } from './rsc-start-page'

describe('Vite dev: a separate RSC provider', () => {
  // J4.2 (user ruling D6): only server functions client code references are
  // callable over HTTP. `internal` is called by `greet`'s handler only
  // (server origin, allowed); a request by its id from the browser must be
  // refused.
  // Bug: a server-environment caller reports every server fn it compiles as
  // client-referenced (handleCreateServerFn.ts `isClientReferenced`), so the
  // resolver's client-origin check never refuses anything with a separate
  // provider.
  // Impact: a server fn only server code uses is callable by anyone who
  // learns its id.
  // Source: start S36; the compiler-level pin was in
  // start-plugin-core/tests/createServerFn/createServerFn.test.ts.
  test.fails(
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
          'src/routes/index.tsx':
            page(`import { createClientRpc } from '@tanstack/react-start/client-rpc'
if (typeof window !== 'undefined') {
  ;(window as any).callUrl = async (url: string) => {
    const id = decodeURIComponent(new URL(url, location.href).pathname.split('/').at(-1)!)
    let ok: boolean | undefined
    try {
      const value = await createClientRpc(id)({ method: 'GET', fetch: async (request: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetch(request, init)
        ok = response.ok
        return response
      } })
      const error = value instanceof Error ? value : value?.error
      return { ok, error: error ? String(error) : undefined, value: JSON.stringify(value, (_key, item) => item instanceof Error ? String(item) : item) }
    } catch (error) {
      return { ok, error: String(error) }
    }
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
      expect(explanation).toMatch(
        /forbid|denied|unauthor|unregistered|unknown.{0,40}function|not.{0,40}(?:found|allow|available|expos|call)|server.only/i,
      )
      expect(explanation).not.toMatch(/TypeError|ReferenceError|SyntaxError/)
      expect(explanation).not.toContain('MARK_INTERNAL')
    },
  )
})
