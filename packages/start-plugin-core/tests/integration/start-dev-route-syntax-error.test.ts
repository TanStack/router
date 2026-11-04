/**
 * A route file that stops parsing, then parses again, on Start's Vite dev
 * server: the open page keeps what it shows (Vite's error overlay reports
 * the error; no reload), and the fix shows in place (SPEC J3.3). Found by
 * the HMR consistency fuzzer: the page full-reloaded while the file was
 * broken, landed on the dev server's error page, and the fix never showed.
 */
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { startDevServer } from '../dev-server'
import { reactApp } from './hydrate-dev-edits'

const timeout = 90_000

const rootRoute = (text: string, broken = false) =>
  `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <p data-probe="root">${text}</p>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
${broken ? 'const = ;\n' : ''}`

const aboutRoute = (text: string, broken = false) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({ component: About })
function About() {
  return <p data-probe="about">${text}</p>
}
${broken ? 'const = ;\n' : ''}`

const app = {
  ...reactApp,
  'src/hmr-sync.ts': hmrSyncModule,
  'harness/client-entry.ts': `import '../src/hmr-sync'\n${reactApp['harness/client-entry.ts']}`,
  'src/routes/__root.tsx': rootRoute('root-v1'),
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p data-probe="index">index-v1</p> })
`,
  'src/routes/about.tsx': aboutRoute('about-v1'),
}

describe('Vite dev, Start: a route file that stops parsing, then parses again', () => {
  test(
    'the root route: the page keeps what it shows, and the fix shows in place',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        plugins: [react()],
        files: app,
      })
      const page = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      const inFlight = trackRequests(page)
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      await page.waitForText('root-v1', { selector: '[data-probe=root]' })

      await server.edit({ 'src/routes/__root.tsx': rootRoute('root-v2', true) })
      // the outcome of a broken edit: Vite's overlay reports it, on the same document
      await page.page.waitForSelector('vite-error-overlay', { timeout: 20_000 })
      expect(page.loads(), 'the page reloaded while the file was broken').toBe(
        1,
      )
      await page.waitForText('root-v1', { selector: '[data-probe=root]' })

      await server.edit({ 'src/routes/__root.tsx': rootRoute('root-v3') })
      await settlePage(server, page, inFlight)
      await page.waitForText('root-v3', {
        selector: '[data-probe=root]',
        timeout: 20_000,
      })
      expect(page.loads()).toBe(1)
    },
    timeout,
  )

  test(
    'another route: the page keeps what it shows, and the fixed route shows when navigated to',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        plugins: [react()],
        files: app,
      })
      const page = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      const inFlight = trackRequests(page)
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      await page.waitForText('index-v1', { selector: '[data-probe=index]' })

      await server.edit({
        'src/routes/about.tsx': aboutRoute('about-v2', true),
      })
      await page.page.waitForSelector('vite-error-overlay', { timeout: 20_000 })
      expect(page.loads(), 'the page reloaded while the file was broken').toBe(
        1,
      )
      await page.waitForText('index-v1', { selector: '[data-probe=index]' })

      await server.edit({ 'src/routes/about.tsx': aboutRoute('about-v3') })
      await settlePage(server, page, inFlight)
      await page.waitForText('index-v1', { selector: '[data-probe=index]' })
      await page.page.evaluate(() =>
        (window as any).__TSR_ROUTER__.navigate({ to: '/about' }),
      )
      await page.waitForText('about-v3', {
        selector: '[data-probe=about]',
        timeout: 20_000,
      })
      expect(page.loads()).toBe(1)
    },
    timeout,
  )
})
