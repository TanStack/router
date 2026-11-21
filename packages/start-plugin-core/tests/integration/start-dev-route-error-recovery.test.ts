/**
 * Route HMR after a route component threw in the browser, on Start's Vite
 * dev server with each framework's own hot updates (`@vitejs/plugin-react`,
 * `vite-plugin-solid`, `@vitejs/plugin-vue`), in apps whose root route
 * renders the document (`shellComponent`) and no route has an error
 * component, so the router's global catch boundary holds the error: an edit
 * that fixes the component shows without a manual reload (SPEC J3.3), both
 * when the component threw during hydration and when an earlier edit made
 * it throw; and with a route error component, which catches it instead.
 * Where the framework cannot recover in place, route HMR reloads the page
 * (`router._hmrReload`). After a loader failed: start-dev-route-loader-error.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { startDevServer } from '../dev-server'
import { apps, index } from './route-error-apps'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

const timeout = 90_000

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
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
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
    timeout,
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
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
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
      await server.idle()

      await server.edit({
        'src/routes/index.tsx': index(framework, 'home-v3', false),
      })
      await browser.waitForText('home-v3', {
        selector: '[data-probe=home]',
        timeout: 20_000,
      })
    },
    timeout,
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
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
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
      // React Refresh retries the failed route boundary in place; Solid's and
      // Vue's route boundaries do not reset when the fixed component swaps
      // in, so the page reloads (the server's HTML of the reload can show
      // before its load event)
      await expect
        .poll(() => browser.loads())
        .toBe(framework === 'react' ? 1 : 2)
    },
    timeout,
  )
})
