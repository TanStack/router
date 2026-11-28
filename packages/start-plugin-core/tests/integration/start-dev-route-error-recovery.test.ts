/**
 * Route HMR after a route component threw in the browser, on Start's Vite
 * dev server with each framework's own hot updates (`@vitejs/plugin-react`,
 * `vite-plugin-solid`, `@vitejs/plugin-vue`), in apps whose root route
 * renders the document (`shellComponent`) and no route has an error
 * component, so the router's global catch boundary holds the error: an edit
 * that fixes the component shows without a manual reload (SPEC J3.3), both
 * when the component threw during hydration and when an earlier edit made
 * it throw; and with a route error component, which catches it instead.
 * Where the framework cannot recover in place (the global boundary of the
 * hydrated root replaced the document), route HMR reloads the page. After a loader failed: start-dev-route-loader-error.
 */
import { describe, expect, test } from 'vitest'
import { openTestPage } from '../test-page'
import { startDevServer } from '../dev-server'
import { apps, index, rootRendersDocument } from './route-error-apps'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

/** Waits until the page reported the component's throw (what it shows then is the router's business). */
const waitForThrow = (browser: BrowserPage) =>
  expect
    .poll(
      () =>
        [...browser.console, ...browser.errors].some((line) =>
          line.includes('home-throws-in-browser'),
        ),
      { timeout: 15_000 },
    )
    .toBe(true)

describe('Vite dev, Start with a document shell: a route edit after a component threw', () => {
  // Found by the real-app differential corpus (thomascarter613/bun-monorepo,
  // a Solid Start template; signature T1): on main a Solid route edit
  // full-reloads; with route HMR the edit hot-updated, the global boundary
  // reset and re-rendered the root match, whose shell renders `<html>`,
  // which Solid cannot render outside hydration ("template is not a
  // function"), so no edit showed until the user reloaded.
  test.each(['react', 'solid', 'vue'] as const)(
    '%s: an edit that fixes a component that threw during hydration shows',
    async (framework) => {
      const app = apps[framework]
      const server = await startDevServer({
        ...app,
        start: {},
        browser: true,
        files: {
          ...app.files,
          'src/routes/index.tsx': index(framework, 'home-v1', true),
        },
      })
      const browser = await openTestPage(server.url!)
      await waitForThrow(browser)
      await server.idle()

      await server.edit({
        'src/routes/index.tsx': index(framework, 'home-v2', false),
      })
      await browser.waitForText('home-v2', {
        selector: '[data-probe=home]',
        timeout: 20_000,
      })
    },
  )

  test.each(['react', 'solid', 'vue'] as const)(
    '%s: an edit that makes a component throw, then one that fixes it, shows the fix',
    async (framework) => {
      const app = apps[framework]
      const server = await startDevServer({
        ...app,
        start: {},
        browser: true,
        files: {
          ...app.files,
          'src/routes/index.tsx': index(framework, 'home-v1', false),
        },
      })
      const browser = await openTestPage(server.url!)
      await browser.waitForText('home-v1', { selector: '[data-probe=home]' })
      // the client router is on the page (hydration ran)
      await browser.page.waitForFunction(
        () => (window as any).__TSR_ROUTER__ !== undefined,
      )
      await server.idle()

      await server.edit({
        'src/routes/index.tsx': index(framework, 'home-v2', true),
      })
      await waitForThrow(browser)
      if (framework === 'react') {
        // The global boundary replaced the document during the update: the
        // page reloads once, in this save, and the reloaded document throws
        // again while hydrating. The fixing edit waits for that document
        // (a save during its hydration is a known limit, KNOWN-BUGS.md)
        await expect.poll(() => browser.loads()).toBe(2)
        await browser.page.waitForFunction(
          () =>
            (window as any).__TSR_ROUTER__ !== undefined &&
            document.body.innerText.includes('Something went wrong'),
        )
      }
      await server.idle()

      await server.edit({
        'src/routes/index.tsx': index(framework, 'home-v3', false),
      })
      await browser.waitForText('home-v3', {
        selector: '[data-probe=home]',
        timeout: 20_000,
      })
    },
  )

  test.each(['react', 'solid', 'vue'] as const)(
    '%s: with a route error component, an edit that makes a component throw, then one that fixes it, shows the fix',
    async (framework) => {
      const app = apps[framework]
      const server = await startDevServer({
        ...app,
        start: {},
        browser: true,
        files: {
          ...app.files,
          'src/routes/index.tsx': index(framework, 'home-v1', false, true),
        },
      })
      const browser = await openTestPage(server.url!)
      await browser.waitForText('home-v1', { selector: '[data-probe=home]' })
      await browser.page.waitForFunction(
        () => (window as any).__TSR_ROUTER__ !== undefined,
      )
      await server.idle()

      await server.edit({
        'src/routes/index.tsx': index(framework, 'home-v2', true, true),
      })
      await browser.waitForText('route-error', {
        selector: '[data-probe=error]',
      })
      await server.idle()

      await server.edit({
        'src/routes/index.tsx': index(framework, 'home-v3', false, true),
      })
      await browser.waitForText('home-v3', {
        selector: '[data-probe=home]',
        timeout: 20_000,
      })
      // the route's boundary resets in place when the route loads again
      await expect.poll(() => browser.loads()).toBe(1)
    },
  )

  // Review of the route HMR implementation (11-23): a root route whose
  // component renders the document, with its own error component, catches
  // the throw of a route under it: that boundary replaces the document as
  // the global one does
  test.each(['react', 'solid', 'vue'] as const)(
    '%s: a root route rendering the document with its own error component: an edit that fixes a component that threw during hydration shows',
    async (framework) => {
      const app = apps[framework]
      const server = await startDevServer({
        ...app,
        start: {},
        browser: true,
        files: {
          ...app.files,
          'src/routes/__root.tsx': rootRendersDocument[framework],
          'src/routes/index.tsx': index(framework, 'home-v1', true),
        },
      })
      const browser = await openTestPage(server.url!)
      // the root route's boundary caught the throw (Solid's blanks the
      // document it replaced)
      await expect
        .poll(
          () =>
            browser.console.some((line) =>
              line.includes('Error in route match: __root__'),
            ),
          { timeout: 15_000 },
        )
        .toBe(true)
      await server.idle()

      await server.edit({
        'src/routes/index.tsx': index(framework, 'home-v2', false),
      })
      await browser.waitForText('home-v2', {
        selector: '[data-probe=home]',
        timeout: 20_000,
      })
    },
  )
})
