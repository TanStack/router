/**
 * The app and the open tab of the route-set reload tests on Start's Rsbuild
 * dev server (`route-set-reload*.test.ts`): a change of the client's route
 * tree (a route added or deleted, a page turned into a server handler or
 * back, a lazy file added) reloads the open tab once both compilers serve
 * it (SPEC J3.10, as Start on Vite does); an edit that leaves the route set
 * as it was does not. The tab is a real browser page served by Start's own
 * dev middleware; what it shows, its page loads and the documents the
 * server answered it are what the tests read.
 */
import path from 'node:path'
import { pluginReact } from '@rsbuild/plugin-react'
import { trackRequests } from '@tanstack/compiler-test-utils/hmr-sync'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { workspacePackage } from '@tanstack/compiler-test-utils/workspace-packages'
import { openTestPage } from '../../test-close'
import { startServerEntryFiles } from '../../dev-server'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import type { TanStackStartRsbuildInputConfig } from '../../../src/rsbuild'

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/** A route file whose route is a page showing `marker`. */
export const pageRoute = (id: string, marker: string) =>
  `${head}export const Route = createFileRoute('${id}')({ component: () => <p>${marker}</p> })\n`

/** A route file whose route is a server handler answering `text` (server-only: not in the client's tree). */
export const handlerRoute = (id: string, text: string) =>
  `${head}export const Route = createFileRoute('${id}')({ server: { handlers: { GET: () => new Response('${text}') } } })\n`

/**
 * Start's default client and server entries, the real router over the
 * generated tree, a root route that renders the document with links to
 * `/about`, `/new` and `/extra`, a hydration marker and a not-found
 * component, an index page and `/about` as a page.
 */
export const reloadApp: Record<string, string> = {
  ...startServerEntryFiles,
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'src/hmr-sync.ts': `declare const __webpack_hash__: string
if (typeof window !== 'undefined') {
  ;(window as any).__harnessHash = () => __webpack_hash__
}
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
          <Link to="/" data-testid="to-index">index</Link>
          <Link to="/about" data-testid="to-about">about</Link>
          <Link to="/new" data-testid="to-new">new</Link>
          <Link to="/extra" data-testid="to-extra">extra</Link>
        </nav>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/routes/index.tsx': pageRoute('/', 'MARK_INDEX'),
  'src/routes/about.tsx': pageRoute('/about', 'MARK_ABOUT'),
}

/**
 * React Refresh as in an installed app: Start's packages are installed
 * under `node_modules`, which React Refresh leaves out by default; the
 * harness links them from the workspace instead, where it would instrument
 * Start's client module (whose React Refresh boundary then accepts the route
 * tree's hot update, as in a monorepo that links Start). Either way the tab
 * gets a new route set by a reload, which Start sends once the client and
 * the server serve it (the tree module accepts its own update in dev).
 */
export const installedReact = () =>
  pluginReact({
    reactRefreshOptions: {
      exclude: [
        /[\\/]node_modules[\\/]/,
        path.dirname(workspacePackage('@tanstack/react-start')) + path.sep,
      ],
    },
  })

/**
 * Where the app has Start: `installed` (under `node_modules`, as an app that
 * installed it: React Refresh leaves Start's client out) or `linked` (from
 * the workspace, as in a monorepo: React Refresh instruments it).
 */
export type StartLayout = 'installed' | 'linked'

export const startLayouts: ReadonlyArray<StartLayout> = ['installed', 'linked']

export interface ReloadServer {
  server: RsbuildDevServer
  url: string
  /** The hash of the client's last compile. */
  clientHash: () => string | undefined
  /**
   * What the dev server sent its clients through Rsbuild's API
   * (`environments.client.hot.send`, `sockWrite`): message types, and a
   * custom message's event.
   */
  sent: Array<string>
}

/**
 * Start's Rsbuild dev server on `reloadApp` (with `files` over it), HMR on,
 * React Refresh as in the `layout` (default `installed`: `installedReact`).
 */
export async function startReloadServer(
  options: {
    /** Files over `reloadApp` (`null`: one of its files left out). */
    files?: Record<string, string | null>
    symlinks?: Record<string, string>
    config?: RsbuildConfig
    plugins?: Array<RsbuildPlugin>
    start?: TanStackStartRsbuildInputConfig
    hmr?: boolean
    layout?: StartLayout
  } = {},
): Promise<ReloadServer> {
  let clientHash: string | undefined
  const recordClientHash: RsbuildPlugin = {
    name: 'test:client-hash',
    setup(api) {
      api.onAfterEnvironmentCompile(({ stats, environment }) => {
        if (environment.name === 'client' && stats) {
          clientHash = stats.hash ?? undefined
        }
      })
    },
  }
  const server = await startRsbuildStartDevServer({
    hmr: options.hmr ?? true,
    browser: true,
    start: options.start,
    symlinks: options.symlinks,
    // Start serves the pages, not an HTML template.
    config: {
      ...options.config,
      // (Rsbuild's client reports a hot update it fell back to a reload for
      // in the tab's console, `HMR update failed`: `Tab.failedUpdates`)
      dev: {
        ...options.config?.dev,
        client: { logLevel: 'error', ...options.config?.dev?.client },
      },
      tools: { htmlPlugin: false, ...options.config?.tools },
      plugins: [
        // (linked: the harness's default `pluginReact()`)
        ...((options.layout ?? 'installed') === 'installed'
          ? [installedReact()]
          : []),
        recordClientHash,
        ...(options.plugins ?? []),
      ],
    },
    files: Object.fromEntries(
      Object.entries({ ...reloadApp, ...options.files }).filter(
        (entry): entry is [string, string] => entry[1] !== null,
      ),
    ),
  })
  const sent: Array<string> = []
  const record = (type: string, data: unknown) =>
    sent.push(
      type === 'custom'
        ? `custom:${String((data as { event?: unknown } | undefined)?.event)}`
        : type,
    )
  const { devServer } = server
  const hot = devServer.environments.client?.hot
  if (hot) {
    const send = hot.send.bind(hot)
    hot.send = ((type: string, data?: unknown) => {
      record(type, data)
      send(type as never, data as never)
    }) as typeof hot.send
  }
  const sockWrite = devServer.sockWrite.bind(devServer)
  devServer.sockWrite = ((type: string, data?: unknown) => {
    record(type, data)
    sockWrite(type as never, data as never)
  }) as typeof devServer.sockWrite
  return { server, url: server.url!, clientHash: () => clientHash, sent }
}

/** A document the server answered the tab: its status and body. */
export interface TabDocument {
  status: number
  body: string
}

export interface Tab {
  browser: BrowserPage
  /** The documents the server answered the tab (its navigations), in order. */
  documents: Array<Promise<TabDocument>>
  /** How many times the tab loaded a document (its first load included). */
  loads: () => number
  /** What `#app` shows. */
  shows: () => Promise<string>
  /** Navigates with the tab's own router (its link to `path`) and waits for `expected` in `#app`. */
  visit: (testId: string, expected: string) => Promise<void>
  /**
   * Waits until the tab loaded `count` documents and, unless `app` is
   * false (a handler's response), hydrated the last.
   */
  loaded: (count: number, options?: { app?: boolean }) => Promise<void>
  /** Waits until the tab runs the client's last compile with nothing in flight (no reload under way). */
  settled: () => Promise<void>
  /** What Rsbuild's client logged of hot updates it fell back to a reload for. */
  failedUpdates: () => Array<string>
}

/** Opens `path` in a tab of `reload`'s server and waits for its hydration. */
export async function openTab(reload: ReloadServer, path: string) {
  const documents: Array<Promise<TabDocument>> = []
  const browser = await openTestPage(new URL(path, reload.url).href)
  // (listening after the first document: the tab's first answer is pushed below)
  browser.page.on('response', (response) => {
    if (
      response.request().isNavigationRequest() &&
      response.frame() === browser.page.mainFrame()
    ) {
      documents.push(
        response.text().then(
          (body) => ({ status: response.status(), body }),
          () => ({ status: response.status(), body: '' }),
        ),
      )
    }
  })
  documents.push(Promise.resolve({ status: 200, body: '(first document)' }))
  const inFlight = trackRequests(browser)
  /** Whether the document is the app's, hydrated (a handler's document never is). */
  const hydrated = () =>
    browser.page
      .evaluate(
        () =>
          document.querySelector('[data-testid=hydrated]')?.textContent ===
          'hydrated',
      )
      .catch(() => false)
  const pageState = () =>
    browser.page
      .evaluate(() => [
        (window as any).__harnessHash?.() as string | undefined,
        document.readyState,
      ])
      .catch(() => [undefined, 'loading'])
  await browser.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
  const tab: Tab = {
    browser,
    failedUpdates: () =>
      browser.console.filter((line) => line.includes('HMR update failed')),
    documents,
    loads: () => browser.loads(),
    shows: () => browser.text('#app').catch(() => ''),
    async visit(testId, expected) {
      await browser.page.locator(`[data-testid=${testId}]`).click()
      await browser.waitForText(expected, { selector: '#app' })
    },
    loaded: (count, options) =>
      waitForOutcome({
        timeout: 15_000,
        applied: async () =>
          browser.loads() >= count &&
          (options?.app === false ||
            (await browser.page
              .evaluate(() => document.readyState === 'complete')
              .catch(() => false))) &&
          (options?.app === false || (await hydrated())),
        quiet: () => inFlight() === 0,
        describe: async () =>
          `the tab did not load ${count} documents: ${browser.loads()} loads, #app ${JSON.stringify(await tab.shows())}, errors ${JSON.stringify(browser.errors)}`,
      }),
    settled: () =>
      waitForOutcome({
        timeout: 10_000,
        applied: async () => {
          const [hash, readyState] = await pageState()
          return (
            hash === reload.clientHash() &&
            readyState === 'complete' &&
            (await hydrated())
          )
        },
        quiet: () => inFlight() === 0,
        describe: async () =>
          `the tab did not run the client's last compile ${reload.clientHash()}: ${JSON.stringify(await pageState())}`,
      }),
  }
  return tab
}

/** The body of the first document the server answered the tab after `index` (its reload), once it came. */
export async function documentAfter(tab: Tab, index: number) {
  return (await tab.documents[index])?.body
}
