/**
 * Start's router wiring on a running Vite dev server, with Start's whole
 * Vite plugin (dev-server.ts `start`): the client route tree, which leaves
 * out server-only routes, follows edits that turn a route into a page or
 * into a server-only route; an edited page route hot-updates in a real
 * browser page.
 */
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import { startDevServer } from './dev-server'
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
 * Waits until the client got the route tree's change since the HMR message
 * `from` (a full page reload, or a hot update the route tree takes part in)
 * and returns those messages, or `[]` after a bounded wait. The router
 * generator handles the edit in the background: its message may come after
 * `edit()` returned.
 */
async function routeTreeChange(server: DevServer, from: number) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const change = server.hmr
      .slice(from)
      .filter((message) => message.environment === 'client')
      .filter(
        (message) =>
          message.type === 'full-reload' ||
          (message.type === 'update' &&
            message.paths.includes('/src/routeTree.gen.ts')),
      )
    if (change.length > 0 || Date.now() > deadline) {
      return describeHmr(change)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

describe('Vite dev: a route switching between page and server-only', () => {
  // The client gets each change of the route tree, as a full reload or as a
  // hot update the route tree takes part in (user ruling 2026-10-18: tests
  // never require a full reload).
  // Source: mutation round 3 start-router D (dev-server.ts mounted only the
  // compiler plugin, so Start's dev server hooks never ran).
  test(
    'the client route tree follows the edits, and the client gets each change of it',
    async () => {
      const server = await startDevServer({
        start: {},
        files: {
          'src/routes/page.tsx': `${head}export const Route = createFileRoute('/page')({ component: () => 'MARK_PAGE' })\n`,
          'src/routes/api.tsx': api(handlers('x')),
          'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
        },
      })
      /**
       * Saves `src/routes/api.tsx` like a person does: in a later clock tick
       * of the file system than the previous save. (The router generator
       * tells edits apart by modification time only, which the kernel
       * updates once per tick: a second save within the tick of the first
       * is not seen. See FOLLOWUPS, 2026-10-18 w2-builddev.)
       */
      const saveApi = async (options: string) => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        await server.edit({ 'src/routes/api.tsx': api(options) })
      }
      /** Route modules the client route tree imports. */
      const clientRoutes = async () =>
        Object.keys(await server.load('/src/routeTree.gen.ts'))
          .filter((url) => url.startsWith('/src/routes/'))
          .sort()

      expect(await clientRoutes()).toEqual([
        '/src/routes/__root.tsx',
        '/src/routes/page.tsx',
      ])

      // An edit of a server-only route that keeps it server-only changes
      // nothing in the client
      const beforeHandlerEdit = server.hmr.length
      await saveApi(handlers('y'))
      expect(
        server.hmr
          .slice(beforeHandlerEdit)
          .filter((message) => message.environment === 'client'),
      ).toEqual([])

      // Server-only -> page
      const beforePage = server.hmr.length
      await saveApi(`${handlers('y')}, ${component}`)
      expect(await routeTreeChange(server, beforePage)).not.toEqual([])
      expect(await clientRoutes()).toContain('/src/routes/api.tsx')

      // Page with handlers -> page without handlers
      await saveApi(component)
      expect(await clientRoutes()).toContain('/src/routes/api.tsx')

      // Page -> server-only
      const beforeApi = server.hmr.length
      await saveApi(handlers('z'))
      expect(await routeTreeChange(server, beforeApi)).not.toEqual([])
      expect(await clientRoutes()).toEqual([
        '/src/routes/__root.tsx',
        '/src/routes/page.tsx',
      ])
    },
    timeout,
  )

  // The server starts before any browser loaded the client route tree.
  // Source: mutation round 3 start-router I/J (spc:5972).
  test(
    'a route that becomes a page before the client loaded the route tree is in the client route tree',
    async () => {
      const server = await startDevServer({
        start: {},
        files: {
          'src/routes/api.tsx': api(handlers('x')),
          'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
        },
      })
      await server.edit({
        'src/routes/api.tsx': api(`${handlers('x')}, ${component}`),
      })
      expect(Object.keys(await server.load('/src/routeTree.gen.ts'))).toContain(
        '/src/routes/api.tsx',
      )
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
  // The page is the app's `index.html`, rendered on the client: Start's SSR
  // document needs the real `@tanstack/react-start`, which depends on this
  // package. Start's SSR with HMR in a real app: e2e/react-start/hmr.
  // Source: mutation round 3 start-router I/J (spc:6046).
  test(
    'an edited page route shows its new loader and component without a full reload, and its split component keeps its state',
    async () => {
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
        start: {},
        realRouter: true,
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
export const getRouter = () => createRouter({ routeTree })
`,
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
          'src/routes/index.tsx': page('loader v1', 'Page v1'),
        },
      })
      const fullReloads = () =>
        server.hmr.filter(
          (message) =>
            message.environment === 'client' && message.type === 'full-reload',
        )
      /** Waits until the dev server sent no HMR message for a while. */
      const quiet = async () => {
        let count = server.hmr.length
        let since = Date.now()
        for (;;) {
          await new Promise((resolve) => setTimeout(resolve, 25))
          if (server.hmr.length !== count) {
            count = server.hmr.length
            since = Date.now()
          } else if (Date.now() - since >= 300) {
            await server.idle()
            return
          }
        }
      }
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      const shows = (text: string) =>
        browser.waitForText(text, { selector: '#app' })
      await shows('Page v1 loader v1 count 0')
      await quiet()
      await browser.page.locator('#app button').click()
      await browser.page.locator('#app button').click()
      await shows('Page v1 loader v1 count 2')

      // Route options outside the split component change
      await server.write({
        'src/routes/index.tsx': page('loader v2', 'Page v1'),
      })
      await shows('Page v1 loader v2 count 2')
      await quiet()

      // The split component changes
      await server.write({
        'src/routes/index.tsx': page('loader v2', 'Page v2'),
      })
      await shows('Page v2 loader v2 count 2')
      await quiet()

      expect(browser.loads()).toBe(1)
      expect(describeHmr(fullReloads())).toEqual([])
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})
