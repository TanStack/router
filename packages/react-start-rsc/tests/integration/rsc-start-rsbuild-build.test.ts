/**
 * A production build of a React Start app with RSC enabled on Rsbuild
 * (`rsc-app.ts`: `rsbuild build`, served by `rsbuild preview`) in a real
 * page: a server function only its route's component calls (SPEC J4.1, J2:
 * the component is split, the server fn's module renders on the server
 * with its SSR stub). The dev counterpart is rsc-start-rsbuild.test.ts.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import {
  openRscPage,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'
import type { RscPreviewServer } from './rsc-app'

/**
 * A server fn only server code calls (`internal`, called by `greet`'s
 * handler) next to one the client references, and a page exposing both
 * URLs and a caller that sends the real request envelope to a URL.
 */
const privateFnFiles = {
  'src/private/internal.ts': `import { createServerFn } from '@tanstack/react-start'
export const internal = createServerFn().handler(() => 'MARK_INTERNAL')
`,
  'src/private/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { internal } from './internal'
export const greet = createServerFn().handler(async () => 'MARK_GREET:' + (await internal()))
export const urls = createServerFn().handler(() => ({ internal: internal.url }))
`,
  'src/routes/private.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { greet, urls } from '../private/fns'
export const Route = createFileRoute('/private')({
  loader: async () => ({ label: await greet(), internalUrl: (await urls()).internal }),
  component: Page,
})
if (typeof window !== 'undefined') {
  // The public caller supplies the real request envelope; only its URL
  // changes (no id parsing: the server decides by the id in the URL).
  ;(window as any).callUrl = async (url: string) => {
    let outcome: { ok: boolean; value: string } | undefined
    let error: string | undefined
    try {
      const value: unknown = await greet({ fetch: async (_input, init) => {
        const response = await fetch(url, init)
        outcome = { ok: response.ok, value: await response.clone().text() }
        return response
      } } as any)
      if (value instanceof Error) { error = String(value) }
    } catch (thrown) {
      if (!outcome) { throw thrown }
      error = String(thrown)
    }
    return { ...outcome, error }
  }
}
function Page() {
  const data = Route.useLoaderData()
  return (
    <main>
      <p data-testid="label">label {data.label}</p>
      <p data-testid="urls">{JSON.stringify({ greet: greet.url, internal: data.internalUrl })}</p>
    </main>
  )
}
`,
}

let server: RscPreviewServer & { errors: Array<string> }
const cleanups: Array<() => Promise<void>> = []

beforeAll(async () => {
  server = await startRscRsbuildPreviewServer({
    registerCleanup: (cleanup) => {
      cleanups.push(cleanup)
    },
    files: {
      ...privateFnFiles,
      'src/routes/component-fn.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
const greet = createServerFn().handler(async () => 'MARK_HANDLER')
export const Route = createFileRoute('/component-fn')({
  component: Page,
})
function Page() {
  const call = useServerFn(greet)
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="label">MARK_PAGE</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => call().then(setCalled)}>call</button>
    </main>
  )
}
`,
    },
  })
})
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup()
  }
})

// Found by the react-start/rsc e2e app (rsbuild-ssr): the SSR output named
// the server fn's SSR stub without importing it, so every page failed.
test("a server fn only its route's component calls renders on the server and answers the browser", async () => {
  expect(server.errors).toEqual([])
  const page = await openRscPage(server, '/component-fn')
  await page.waitForText('MARK_PAGE', { selector: '[data-testid=label]' })
  await waitForHydration(page)
  await page.page.locator('[data-testid=call]').click()
  await page.waitForText('called MARK_HANDLER', {
    selector: '[data-testid=called]',
  })
})

// SPEC J4.2: in a production build only server functions client code
// references are callable over HTTP. `internal` is called by `greet`'s
// handler only (a server-origin call, which works); a request by its URL
// from the browser is refused, while the same request to `greet` answers.
// With a separate provider the provider builds before the client, so the
// refusal is decided where the HTTP handler runs, after the client built.
test('a server function only server code calls is not callable from the browser', async () => {
  const page = await openRscPage(server, '/private')
  await page.waitForText('label MARK_GREET:MARK_INTERNAL', {
    selector: '[data-testid=label]',
  })
  await waitForHydration(page)
  const urls = JSON.parse(await page.text('[data-testid=urls]')) as {
    greet: string
    internal: string
  }
  expect(typeof urls.internal).toBe('string')
  const call = (url: string) =>
    page.page.evaluate(
      (functionUrl) => (window as any).callUrl(functionUrl),
      url,
    ) as Promise<{ ok?: boolean; value?: string; error?: string }>
  // the same envelope reaches an exposed function, so a malformed request
  // cannot masquerade as a refusal of `internal`
  expect(await call(urls.greet)).toMatchObject({
    ok: true,
    value: expect.stringContaining('MARK_GREET:MARK_INTERNAL'),
  })
  const refused = await call(urls.internal)
  expect(refused.ok).toBe(false)
  expect(refused.value ?? '').not.toContain('MARK_INTERNAL')
})
