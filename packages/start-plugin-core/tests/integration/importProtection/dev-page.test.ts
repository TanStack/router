/**
 * Import protection on a Vite dev server with Start's whole plugin, seen the
 * way users meet it: the client through a real browser page Start's dev
 * middleware serves (its HTML, its client entry, a route rendered by the
 * real router and React), the server through HTTP requests. Every entry of
 * an environment counts (SPEC J6.9): the app's client entry, its server
 * entry, the router's split route modules. No test names a module id Start
 * generates (V1 ip S19).
 */
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { startDevServer, startServerEntryFiles } from '../../dev-server'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  expectViolationsAt,
  locationIn,
} from '../../importProtection/start-apps'

const timeout = 30_000

const secretServer = {
  'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
}

/**
 * A Start app a browser opens: Start's default server entry, the default
 * client entry (hydration of `StartClient`), the real router over the
 * generated route tree, a root route rendering the document (`#app`, a
 * hydration marker), and `src/routes/index.tsx` (`index`).
 */
const pageApp = (index: string) => ({
  ...startServerEntryFiles,
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/routes/index.tsx': index,
})

/** Pre-bundled up front, as Vite does for an app that installed them. */
const config = {
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

const plainIndex = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => 'MARK_PAGE' })
`

/** Starts the app of `files` and opens its page `/` once it hydrated. */
async function openApp(files: Record<string, string>) {
  const server = await startDevServer({
    start: {},
    browser: true,
    config,
    plugins: [react()],
    files,
  })
  const browser = await openPage(new URL('/', server.url).href, {
    registerCleanup: onTestFinished,
  })
  await browser.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
  return { server, browser }
}

describe("an app's client entry", () => {
  const leak = `import { secret } from './secret.server'
export const leak = () => secret()
`
  /**
   * The app's own client entry `src/client.tsx` (Start loads it for the
   * page) hydrates the document and keeps what `src/leak.ts` gives, which
   * uses the denied file `src/secret.server.ts`.
   */
  const clientEntryApp = {
    ...pageApp(plainIndex),
    ...secretServer,
    'src/leak.ts': leak,
    'src/client.tsx': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { leak } from './leak'
;(window as unknown as Record<string, unknown>).leaked = leak
hydrateRoot(document, createElement(StartClient))
`,
  }

  // Control for the pin below (same app, same page): the page runs the
  // app's client entry, whose denied import is a safe mock.
  test(
    "the page runs the app's client entry, and its denied import is a safe mock",
    async () => {
      const { browser } = await openApp(clientEntryApp)
      expect(
        await browser.page.evaluate(`(() => {
${describeValuePrelude}
return describeValue(window.leaked(), 'MARK_SECRET')
})()`),
      ).toBe('a safe mock')
    },
    timeout,
  )

  // Bug: dev import protection only logs violations it can reach from the
  // entries it registers, Start's router entry and start entry
  // (vite/import-protection-plugin/plugin.ts `registerEntries`). The app's
  // client entry is not one, and the browser loads it from Start's dev
  // client entry, a virtual module whose imports import protection does not
  // record, so the modules only the client entry imports are unreachable
  // and their violations are discarded.
  // Impact: in dev (mock mode), a denied import reached from the app's
  // client entry (`src/client.tsx`) is mocked without any warning (the build
  // reports it).
  // Source: found by mutation run R3c (looking for edges without transform
  // data); through a real page since V1 ip S19.
  test.fails(
    'a denied import of a module the client entry imports is logged',
    async () => {
      const { server } = await openApp(clientEntryApp)
      expectViolationsAt(server.logs, [
        {
          environment: 'client',
          use: locationIn('src/leak.ts', leak, 2, 'secret()'),
          source: leak,
        },
      ])
    },
    timeout,
  )
})

describe("an app's server entry", () => {
  const handler = `import { widget } from './widget.client'
export const handler = () => widget()
`
  /**
   * The app's own server entry `src/server.ts` answers every request with
   * what `src/handler.ts` gives (`handler`).
   */
  const serverEntryApp = (handlerModule: string) => ({
    'src/widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
    'src/handler.ts': handlerModule,
    'src/server.ts': `import { handler } from './handler'
export default { fetch: () => new Response(String(handler())) }
`,
    'src/router.ts': `export const getRouter = () => undefined\n`,
  })

  const request = async (files: Record<string, string>) => {
    const server = await startDevServer({ start: {}, listen: true, files })
    return { server, response: await server.fetch('/') }
  }

  // Control for the pin below (same harness): a request runs the app's
  // server entry.
  test(
    "a request runs the app's server entry",
    async () => {
      const { response } = await request(
        serverEntryApp(`export const handler = () => 'MARK_HANDLER'\n`),
      )
      expect(response.body).toBe('MARK_HANDLER')
    },
    timeout,
  )

  // Bug: dev import protection only logs violations it can reach from the
  // entries it registers, Start's router entry and start entry
  // (vite/import-protection-plugin/plugin.ts `registerEntries`). The app's
  // server entry is not one, and the entry branch of `resolveId` (no
  // importer) never runs in dev, where Vite passes `<root>/index.html` as
  // the importer, so the modules only the server entry imports are
  // unreachable and their violations are discarded. The server twin of the
  // client entry pin above.
  // Impact: in dev (mock mode), a client-only import reached from the app's
  // custom server entry (`src/server.ts`) is mocked on the server without
  // any warning (the request returns the mock's value).
  // Source: mutation run R4 final re-audit (M3); through a request since
  // V1 ip S19.
  test.fails(
    'a client-only import of a module the server entry imports is mocked on the server and logged',
    async () => {
      const { server, response } = await request(serverEntryApp(handler))
      expect(response.body).not.toContain('MARK_CLIENT')
      expectViolationsAt(server.logs, [
        {
          environment: 'server',
          use: locationIn('src/handler.ts', handler, 2, 'widget()'),
          source: handler,
        },
      ])
    },
    timeout,
  )
})

// The router plugin splits a route's component into a module of its own,
// which the browser loads when the route renders.
describe('a split route component', () => {
  const widget = `import { secret } from './secret.server'
export const widget = () => String(secret())
`
  // `ssr: false` (selective SSR): the server renders no component, which
  // may use the denied file there.
  const route = `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../secret.server'
import { widget } from '../widget'
export const Route = createFileRoute('/')({
  ssr: false,
  component: () => 'MARK_RENDERED ' + String(secret()) + widget(),
})
`

  // Source: mutation run R4 (spc:4529 and the cache of compiled split
  // modules: the denied import, and the import of the module using the
  // denied file, are only in the split module); rendered in a real page
  // since V1 ip S19.
  test(
    'using a denied file, directly or through a module, renders with the mock, and the dev server logs a warning at each use or import',
    async () => {
      const { server, browser } = await openApp({
        ...pageApp(route),
        ...secretServer,
        'src/widget.ts': widget,
      })
      await browser.waitForText('MARK_RENDERED', { selector: '#app' })
      expect(await browser.text('#app')).not.toContain('MARK_SECRET')
      expectViolationsAt(server.logs, [
        {
          environment: 'client',
          use: locationIn('src/routes/index.tsx', route, 6, 'secret()'),
          source: route,
        },
        {
          environment: 'client',
          use: locationIn('src/widget.ts', widget, 2, 'secret()'),
          source: widget,
        },
      ])
    },
    timeout,
  )
})
