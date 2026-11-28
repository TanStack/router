/**
 * The page-and-server-only scenarios of the router dev-server tests, shared
 * by their Vite (`start-router-dev-server.test.ts`) and Rsbuild
 * (`rsbuild/start-router-dev-server.test.ts`) files: the client's route
 * tree leaves out server-only routes (SPEC J2.15), and follows each edit
 * that turns a route into a page or into a server-only route, seen from a
 * real browser page served by Start's own dev middleware.
 */
import { expect } from 'vitest'
import { trackRequests } from '@tanstack/compiler-test-utils/hmr-sync'
import { openTestPage } from '../test-close'
import { startServerEntryFiles } from '../dev-server'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const handlers = (text: string) =>
  `server: { handlers: { GET: () => new Response('${text}') } }`
/** `src/routes/api.tsx` with these route options. */
const api = (options: string) =>
  `${head}export const Route = createFileRoute('/api')({ ${options} })\n`
const component = `component: () => 'MARK_API_PAGE'`

/**
 * The app: Start's default client entry (hydration of `StartClient`), its
 * default server entry (the HTTP handler), the real router over the
 * generated route tree, a root route that renders the document with a link
 * to `/api`, a hydration marker and a not-found component, and `/api` as a
 * server-only route. The router module loads `src/hmr-sync.ts`, which each
 * bundler's file gives (what its `settlePage` reads in the page).
 */
export const serverOnlySwitchApp = {
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
  'src/routes/api.tsx': api(handlers('x')),
}

/** What the scenarios need of a dev server (Vite's and Rsbuild's harnesses differ in names). */
export interface ServerOnlySwitchServer {
  url: string | undefined
  /** Writes app files and waits until the server handled them. */
  edit: (files: Record<string, string | null>) => Promise<unknown>
  /** Waits until the server handled everything written so far. */
  settled: () => Promise<void>
  /**
   * Waits until a page took in everything the server sent it, a reload
   * included: an edit made or a link clicked before that would be missed
   * by the page.
   */
  settlePage: (page: BrowserPage, inFlight: () => number) => Promise<void>
}

/** Waits until `/api` answers `expected` (a handler edit took effect). */
async function apiAnswers(server: ServerOnlySwitchServer, expected: string) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const body = await (await fetch(new URL('/api', server.url))).text()
    if (body.includes(expected)) {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(`/api did not answer ${expected} within 10 s: ${body}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * The client's route tree follows each change of a route between a
 * server-only route and a page: after each edit, the page navigates to the
 * route (its link) and shows the page, or the not-found state once the
 * route is server-only again. A full reload is allowed for a tree change
 * (SPEC J3.10, J1.10); an edit that keeps the route server-only changes
 * nothing for the page (no reload).
 */
export async function switchBetweenServerOnlyAndPage(
  server: ServerOnlySwitchServer,
): Promise<void> {
  const browser = await openTestPage(new URL('/page', server.url).href)
  const inFlight = trackRequests(browser)
  await browser.waitForText('MARK_PAGE', { selector: '#app' })
  await browser.waitForText('hydrated', {
    selector: '[data-testid=hydrated]',
  })
  /** Waits until the page took in what the server sent (a reload too). */
  const settled = () => server.settlePage(browser, inFlight)
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

  // Server-only -> page (`edit`: the server handled every file the edit and
  // the router generator wrote)
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

  // Page -> server-only (edited while the page shows another route: a page
  // left on the route would reload into the handler's response)
  await browser.page.locator('[data-testid=to-page]').click()
  await browser.waitForText('MARK_PAGE', { selector: '#app' })
  await server.edit({ 'src/routes/api.tsx': api(handlers('z')) })
  await apiAnswers(server, 'z')
  await settled()
  await visitApi('MARK_NOT_FOUND')
  expect(browser.errors).toEqual([])
}

/**
 * The server starts before any browser loaded the client route tree; a
 * route that becomes a page then is in the tree the first page loads.
 */
export async function pageBeforeTheClientLoadedTheTree(
  server: ServerOnlySwitchServer,
): Promise<void> {
  await server.edit({
    'src/routes/api.tsx': api(`${handlers('x')}, ${component}`),
  })
  await server.settled()
  const browser = await openTestPage(new URL('/page', server.url).href)
  await browser.waitForText('hydrated', {
    selector: '[data-testid=hydrated]',
  })
  await browser.page.locator('[data-testid=to-api]').click()
  await browser.waitForText('MARK_API_PAGE', { selector: '#app' })
}
