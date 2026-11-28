/**
 * Import protection on a Vite dev server with Start's whole plugin, seen the
 * way users meet it: the client through a real browser page Start's dev
 * middleware serves (its HTML, its client entry, a route rendered by the
 * real router and React), the server through HTTP requests. Every entry of
 * an environment counts (SPEC J6.9): the app's client entry, its server
 * entry, the router's split route modules. No test names a module id Start
 * generates.
 */
import react from '@vitejs/plugin-react'
import { describe, expect, test } from 'vitest'
import { openTestPage } from '../../test-close'
import { startDevServer, startServerEntryFiles } from '../../dev-server'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  expectViolationsAt,
  locationIn,
  violationRecorder,
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

/**
 * Starts the app of `files` and opens its page `/` once it hydrated; the
 * server records the violations Start reports (`violations`).
 */
async function openApp(files: Record<string, string>) {
  const recorder = violationRecorder()
  const started = await startDevServer({
    start: { importProtection: { onViolation: recorder.onViolation } },
    browser: true,
    config,
    plugins: [react()],
    files,
  })
  const server = Object.assign(started, { violations: recorder.violations })
  const browser = await openTestPage(new URL('/', server.url).href)
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

  // A denied import reached only from the app's client entry, which Start's
  // dev client entry loads, is mocked and logged as the build reports it.
  // Source: mutation testing (looking for edges without transform data).
  test(
    "the page runs the app's client entry; its denied import is a safe mock, and logged",
    async () => {
      const { browser, server } = await openApp(clientEntryApp)
      expect(
        await browser.page.evaluate(`(() => {
${describeValuePrelude}
return describeValue(window.leaked(), 'MARK_SECRET')
})()`),
      ).toBe('a safe mock')
      expectViolationsAt(server, [
        {
          environment: 'client',
          use: locationIn('src/leak.ts', leak, 2, 'secret()'),
          also: ['src/leak.ts:1'],
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
    const recorder = violationRecorder()
    const started = await startDevServer({
      start: { importProtection: { onViolation: recorder.onViolation } },
      listen: true,
      files,
    })
    const server = Object.assign(started, { violations: recorder.violations })
    return { server, response: await server.fetch('/') }
  }

  // On main, in dev (mock mode), a client-only import reached from the app's
  // custom server entry (`src/server.ts`) is mocked on the server without any
  // warning (the request returns the mock's value).
  // Source: mutation testing.
  test(
    'a client-only import of a module the server entry imports is mocked on the server and logged',
    async () => {
      const { server, response } = await request(serverEntryApp(handler))
      expect(response.body).not.toContain('MARK_CLIENT')
      expectViolationsAt(server, [
        {
          environment: 'server',
          use: locationIn('src/handler.ts', handler, 2, 'widget()'),
          also: ['src/handler.ts:1'],
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

  // Source: mutation testing (the cache of compiled split modules: the
  // denied import, and the import of the module using the denied file, are
  // only in the split module).
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
      expectViolationsAt(server, [
        {
          environment: 'client',
          use: locationIn('src/routes/index.tsx', route, 6, 'secret()'),
          also: ['src/routes/index.tsx:2'],
        },
        {
          environment: 'client',
          use: locationIn('src/widget.ts', widget, 2, 'secret()'),
          also: ['src/widget.ts:1'],
        },
      ])
    },
    timeout,
  )
})
