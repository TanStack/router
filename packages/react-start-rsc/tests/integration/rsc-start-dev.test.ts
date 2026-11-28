/**
 * Start with a separate server function provider (SPEC J4.2, J4.3, J4.16):
 * a React Start app with RSC enabled on a Vite dev server (`rsc-app.ts`),
 * where the `rsc` environment runs the handlers, SSR forwards its calls to
 * it, and a real page calls them from the browser. Outcomes only: what the
 * page shows, what a call by id answers, what the browser loaded. Edits
 * are in rsc-start-hmr.test.ts.
 */
import { describe, expect } from 'vitest'
import { waitForHydration } from './rsc-app'
import { callFromPage, envMarkerPackage } from './rsc-start-page'
import { test } from './test'

describe('Vite dev: a separate RSC provider', () => {
  // J4.3, J4.16: SSR (the loader during the page render) and a client call
  // both run the handler in the provider, with its module-resolution
  // conditions (`react-server`), and the provider initialises the package
  // once; SSR's own code gets the `default` entry and the browser's the
  // `browser` entry, and no client script has another environment's entry.
  test('each environment runs its own entry of a dependency; the provider runs the handler, whether SSR or the browser calls it', async ({
    openRscPage,
    pageErrors,
    startRscDevServer,
  }) => {
    const server = await startRscDevServer({
      browser: true,
      config: {
        // Bundled into the provider like Start's own packages are
        // (`environments.rsc.resolve.noExternal`): in dev, Vite's module
        // runner imports an externalised dependency natively, with Node's
        // conditions, not the environment's.
        environments: { rsc: { resolve: { noExternal: ['env-marker'] } } },
        // The page imports it too: pre-bundled up front, as Vite does once
        // a page discovers it.
        optimizeDeps: { include: ['env-marker'] },
      },
      files: {
        ...envMarkerPackage,
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { where } from 'env-marker'
export const greet = createServerFn().handler(() => where())
`,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { where } from 'env-marker'
import { greet } from '../fns'
export const Route = createFileRoute('/')({
  loader: async () => ({ own: where(), provider: await greet() }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  const [called, setCalled] = useState('')
  const [browser, setBrowser] = useState('')
  return (
    <main>
      <p data-testid="label">ssr {data.own} provider {data.provider}</p>
      <p data-testid="called">called {called}</p>
      <p data-testid="browser">browser {browser}</p>
      <button data-testid="call" onClick={() => greet().then(setCalled)}>call</button>
      <button data-testid="where" onClick={() => setBrowser(where())}>where</button>
    </main>
  )
}
`,
      },
    })
    const browser = await openRscPage(server, '/')
    await browser
      .locator('[data-testid=label]', {
        hasText: 'ssr MARK_DEFAULT provider MARK_REACT_SERVER:1',
      })
      .waitFor()
    await waitForHydration(browser)
    await callFromPage(browser, 'called MARK_REACT_SERVER:1')
    await browser.locator('[data-testid=where]').click()
    await browser
      .locator('[data-testid=browser]', { hasText: 'browser MARK_BROWSER' })
      .waitFor()

    // What the browser loaded as code (not the server fn answers)
    const scripts = await browser.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter(
          (entry) =>
            !['fetch', 'xmlhttprequest'].includes(
              (entry as PerformanceResourceTiming).initiatorType,
            ),
        )
        .map((entry) => new URL(entry.name).pathname),
    )
    const leaks: Array<string> = []
    for (const script of scripts) {
      const { body } = await server.fetch(script)
      if (/MARK_REACT_SERVER|MARK_DEFAULT/.test(body)) {
        leaks.push(script)
      }
    }
    // The check covers the dependency's browser entry
    expect(scripts.some((script) => script.includes('env-marker'))).toBe(true)
    expect(leaks).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
