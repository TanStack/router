/**
 * Start's router wiring on a running Vite dev server, with Start's whole
 * Vite plugin (dev-server.ts `start`), seen from a real browser page served
 * by Start's own dev middleware: the client route tree, which leaves out
 * server-only routes, follows edits that turn a route into a page or into a
 * server-only route; an edited page route hot-updates.
 */
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { startDevServer, startServerEntryFiles } from '../dev-server'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const handlers = (text: string) =>
  `server: { handlers: { GET: () => new Response('${text}') } }`
/** `src/routes/api.tsx` with these route options. */
const api = (options: string) =>
  `${head}export const Route = createFileRoute('/api')({ ${options} })\n`
const component = `component: () => 'MARK_API_PAGE'`

/**
 * The app of the page tests: Start's default client entry (hydration of
 * `StartClient`), its default server entry (the HTTP handler), the real
 * router over the generated route tree, and a root route that renders the
 * document with a link to `/api`, a hydration marker and a not-found
 * component. The router module loads `src/hmr-sync.ts` (`settlePage`).
 */
const pageAppFiles = {
  ...startServerEntryFiles,
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './hmr-sync'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/hmr-sync.ts': hmrSyncModule,
  'src/routes/__root.tsx': `import { HeadContent, Link, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: Root,
  notFoundComponent: () => <p>MARK_NOT_FOUND</p>,
})
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <nav>
          <Link to="/page" data-testid="to-page">to page</Link>
          <Link to="/api" data-testid="to-api">to api</Link>
        </nav>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/routes/page.tsx': `${head}export const Route = createFileRoute('/page')({ component: () => 'MARK_PAGE' })\n`,
}

/** Pre-bundled up front, as Vite does for an app that installed them. */
const pageAppConfig = {
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      '@tanstack/react-router',
      '@tanstack/react-router > @tanstack/router-core > seroval',
      '@tanstack/react-router > @tanstack/router-core > seroval-plugins/web',
    ],
  },
}

/** Waits until `/api` answers `expected` (a handler edit took effect). */
async function apiAnswers(server: DevServer, expected: string) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const { body } = await server.fetch('/api')
    if (body.includes(expected)) {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(`/api did not answer ${expected} within 10 s: ${body}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

describe('Vite dev: a route switching between page and server-only', () => {
  // The client's route tree follows each change of a route between a
  // server-only route and a page: after each edit, the page navigates to
  // the route (its link) and shows the page, or the not-found state once
  // the route is server-only again. A full reload is allowed for a tree
  // change (SPEC J3.10, J1.10); an edit that keeps the route server-only
  // changes nothing for the client (no reload, no update).
  // Source: mutation testing.
  test(
    'the page follows a route that becomes a page, loses its handlers and becomes server-only again',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        config: pageAppConfig,
        plugins: [react()],
        files: { ...pageAppFiles, 'src/routes/api.tsx': api(handlers('x')) },
      })
      const browser = await openPage(new URL('/page', server.url).href, {
        registerCleanup: onTestFinished,
      })
      const inFlight = trackRequests(browser)
      await browser.waitForText('MARK_PAGE', { selector: '#app' })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      /** Waits until the page took in what the server sent (a reload too). */
      const settled = () => settlePage(server, browser, inFlight)
      /** Navigates to `/api` through its link and waits for `expected`. */
      const visitApi = async (expected: string) => {
        await browser.page.locator('[data-testid=to-api]').click()
        await browser.waitForText(expected, { selector: '#app' })
      }
      // Server-only: the page shows not found
      await visitApi('MARK_NOT_FOUND')
      await browser.page.locator('[data-testid=to-page]').click()
      await browser.waitForText('MARK_PAGE', { selector: '#app' })
      await settled()

      // An edit of a server-only route that keeps it server-only changes
      // nothing for the page: no reload
      const loads = browser.loads()
      await server.edit({ 'src/routes/api.tsx': api(handlers('y')) })
      await apiAnswers(server, 'y')
      await settled()
      expect(browser.loads()).toBe(loads)

      // Server-only -> page (`edit`: the watcher reported every file the edit
      // and the router generator wrote, and the server handled them)
      await server.edit({
        'src/routes/api.tsx': api(`${handlers('y')}, ${component}`),
      })
      await settled()
      await visitApi('MARK_API_PAGE')

      // Page with handlers -> page without handlers
      await server.edit({ 'src/routes/api.tsx': api(component) })
      await apiAnswers(server, 'MARK_API_PAGE')
      await settled()
      await browser.page.locator('[data-testid=to-page]').click()
      await browser.waitForText('MARK_PAGE', { selector: '#app' })
      await visitApi('MARK_API_PAGE')

      // Page -> server-only (edited while the page shows another route: a
      // page left on the route would reload into the handler's response)
      await browser.page.locator('[data-testid=to-page]').click()
      await browser.waitForText('MARK_PAGE', { selector: '#app' })
      await server.edit({ 'src/routes/api.tsx': api(handlers('z')) })
      await apiAnswers(server, 'z')
      await settled()
      await visitApi('MARK_NOT_FOUND')
      expect(browser.errors).toEqual([])
    },
    timeout,
  )

  // The server starts before any browser loaded the client route tree.
  // Source: mutation testing.
  test(
    'a route that becomes a page before the client loaded the route tree is in the client route tree',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        config: pageAppConfig,
        plugins: [react()],
        files: { ...pageAppFiles, 'src/routes/api.tsx': api(handlers('x')) },
      })
      await server.edit({
        'src/routes/api.tsx': api(`${handlers('x')}, ${component}`),
      })
      await server.idle()
      const browser = await openPage(new URL('/page', server.url).href, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await browser.page.locator('[data-testid=to-api]').click()
      await browser.waitForText('MARK_API_PAGE', { selector: '#app' })
    },
    timeout,
  )
})

describe('Vite dev: route HMR in a real page', () => {
  // Start's client code splitting adds route HMR (Start forces `addHmr` on
  // the client). A real Vite dev server with Start's whole Vite plugin and
  // `@vitejs/plugin-react` serves an app with the real router to a real page
  // (headless Chromium), Vite's own watcher reports the edits, and Vite's
  // HMR client, React Refresh and the route HMR code apply them. The edited
  // page route shows its new loader data and component without a full
  // reload, and its split component keeps its state (no remount).
  // The page is the app's `index.html`, rendered on the client: Start's dev
  // server middleware, which would answer the page request with the app's
  // server entry, is off. Start's SSR with HMR in a real app:
  // e2e/react-start/hmr. `addHmr: false` changes nothing: Start's client
  // always has route HMR (as main did on both bundlers).
  // Source: mutation testing.
  test.each([
    { name: 'by default', router: {} },
    {
      name: 'with addHmr: false',
      router: { codeSplittingOptions: { addHmr: false } },
    },
  ])(
    'an edited page route shows its new loader and component without a full reload, and its split component keeps its state ($name)',
    async ({ router }) => {
      const page = (loader: string, text: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
function Page() {
  const [count, setCount] = useState(0)
  const data = Route.useLoaderData()
  return <button onClick={() => setCount(count + 1)}>${text} {data} count {count}</button>
}
export const Route = createFileRoute('/')({ loader: () => '${loader}', component: Page })
`
      const server = await startDevServer({
        start: { vite: { installDevServerMiddleware: false }, router },
        browser: true,
        // Pre-bundled up front, as Vite does for an app that installed them
        // (the router is a linked workspace package here)
        config: {
          optimizeDeps: {
            include: [
              'react',
              'react/jsx-dev-runtime',
              'react-dom',
              'react-dom/client',
              '@tanstack/react-router',
            ],
          },
        },
        plugins: [react()],
        files: {
          'index.html': `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
          'src/main.tsx': `import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
createRoot(document.getElementById('app')!).render(<RouterProvider router={getRouter()} />)
`,
          'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './hmr-sync'
export const getRouter = () => createRouter({ routeTree })
`,
          'src/hmr-sync.ts': hmrSyncModule,
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
          'src/routes/index.tsx': page('loader v1', 'Page v1'),
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      const inFlight = trackRequests(browser)
      /** Waits until the page took in what the server sent (a reload too). */
      const settled = () => settlePage(server, browser, inFlight)
      const shows = (text: string) =>
        browser.waitForText(text, { selector: '#app' })
      await shows('Page v1 loader v1 count 0')
      await settled()
      await browser.page.locator('#app button').click()
      await browser.page.locator('#app button').click()
      await shows('Page v1 loader v1 count 2')

      // Route options outside the split component change
      await server.edit({
        'src/routes/index.tsx': page('loader v2', 'Page v1'),
      })
      await settled()
      await shows('Page v1 loader v2 count 2')

      // The split component changes
      await server.edit({
        'src/routes/index.tsx': page('loader v2', 'Page v2'),
      })
      await settled()
      await shows('Page v2 loader v2 count 2')

      // No full reload: the page kept its first document (and the
      // component its state, above)
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})
