/**
 * Edits with a separate server function provider (SPEC J3.6, V2-13): a
 * React Start app with RSC enabled on a Vite dev server, or on an Rsbuild
 * dev server with React Refresh from `@rsbuild/plugin-react` (`rsc-app.ts`),
 * a route module that also declares the server function its loader and page
 * call, and a real page. Outcomes only: what the page shows, what the next
 * call answers, whether the page reloaded. The handler edit on Rsbuild is
 * in rsc-start-rsbuild.test.ts.
 */
import { pluginReact } from '@rsbuild/plugin-react'
import { describe, expect, test } from 'vitest'
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import {
  openRscPage,
  startRscDevServer,
  startRscRsbuildDevServer,
  waitForHydration,
} from './rsc-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

/** Clicks the page's call button and waits for the answer. */
async function callFromPage(browser: BrowserPage, expected: string) {
  await browser.page.locator('[data-testid=call]').click()
  await browser.waitForText(expected, { selector: '[data-testid=called]' })
}

/** The HMR messages telling the client to reload the page. */
const fullReloads = (server: DevServer) =>
  describeHmr(
    server.hmr.filter(
      (message) =>
        message.environment === 'client' && message.type === 'full-reload',
    ),
  )

/**
 * `/`: a server fn whose handler returns `handler`, the loader and the page
 * calling it, the page's text `text` and a counter (component state).
 */
const route = (
  handler: string,
  text: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
const getLabel = createServerFn().handler(() => '${handler}')
export const Route = createFileRoute('/')({
  loader: () => getLabel(),
  component: Page,
})
function Page() {
  const label = Route.useLoaderData()
  const [called, setCalled] = useState('')
  const [count, setCount] = useState(0)
  return (
    <main>
      <p data-testid="text">${text} {label}</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => getLabel().then(setCalled)}>call</button>
      <button data-testid="count" onClick={() => setCount(count + 1)}>count {count}</button>
    </main>
  )
}
`

describe('Vite dev: edits with a separate RSC provider (SPEC J3.6)', () => {
  // A route module that also declares a server function: editing the
  // handler makes the next call run the new code; editing the component
  // hot-updates the page, keeping its state; no full reload either way
  // (user ruling 2026-10-18).
  // Source: SPEC J3.6, V2-13 (#7618 as quoted), start S12 on Vite.
  test('a handler edit reaches the next call and a component edit hot-updates, without a full reload', async () => {
    const server = await startRscDevServer({
      browser: true,
      files: { 'src/routes/index.tsx': route('MARK_HANDLER_V1', 'Page v1') },
    })
    const browser = await openRscPage(server, '/')
    await browser.waitForText('Page v1 MARK_HANDLER_V1')
    await waitForHydration(browser)
    await browser.page.locator('[data-testid=count]').click()
    await browser.page.locator('[data-testid=count]').click()
    await browser.waitForText('count 2')
    await callFromPage(browser, 'called MARK_HANDLER_V1')

    // The handler
    await server.write({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v1'),
    })
    await callFromPage(browser, 'called MARK_HANDLER_V2')
    expect(fullReloads(server)).toEqual([])
    // The client's module of the route never has the handler (J4.12)
    expect(
      await server.transform('/src/routes/index.tsx', 'client'),
    ).not.toContain('MARK_HANDLER_V2')

    // The component
    await server.write({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v2'),
    })
    await browser.waitForText('Page v2', { selector: '[data-testid=text]' })
    expect(await browser.text('[data-testid=count]')).toBe('count 2')

    expect(browser.loads()).toBe(1)
    expect(fullReloads(server)).toEqual([])
    expect(browser.errors).toEqual([])
  })
})

describe('Rsbuild dev: edits with a separate RSC provider (SPEC J3.6)', () => {
  // The component half of the Vite test above on Start's Rsbuild RSC layer
  // (its handler half: rsc-start-rsbuild.test.ts): editing the component of
  // a route module that also declares a server function hot-updates the
  // page, keeping its state, without a full reload; the server fn still
  // answers.
  // Source: SPEC J3.6, V2-13 (#7618 as quoted), Rsbuild component half
  // (DECISIONS 2026-10-19, `@rsbuild/plugin-react`).
  test('a component edit hot-updates, keeping the state, without a full reload', async () => {
    const server = await startRscRsbuildDevServer({
      browser: true,
      hmr: true,
      config: { plugins: [pluginReact()] },
      files: { 'src/routes/index.tsx': route('MARK_HANDLER_V1', 'Page v1') },
    })
    expect(server.errors).toEqual([])
    const browser = await openRscPage(server, '/')
    await browser.waitForText('Page v1 MARK_HANDLER_V1')
    await waitForHydration(browser)
    await browser.page.locator('[data-testid=count]').click()
    await browser.page.locator('[data-testid=count]').click()
    await browser.waitForText('count 2')

    await server.edit({
      'src/routes/index.tsx': route('MARK_HANDLER_V1', 'Page v2'),
    })
    expect(server.errors).toEqual([])
    await browser.waitForText('Page v2', { selector: '[data-testid=text]' })
    expect(await browser.text('[data-testid=count]')).toBe('count 2')
    await callFromPage(browser, 'called MARK_HANDLER_V1')

    expect(browser.loads()).toBe(1)
    expect(browser.errors).toEqual([])
  })
})
