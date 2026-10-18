/**
 * Start's router wiring on a running Vite dev server, with Start's whole
 * Vite plugin (dev-server.ts `start`): the client route tree, which leaves
 * out server-only routes, follows edits that turn a route into a page or
 * into a server-only route.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import {
  describeHmr,
  evaluateServed,
} from '@tanstack/compiler-test-utils/dev-server'
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

describe('Vite dev: route HMR', () => {
  // Start's client code splitting adds route HMR (Start forces `addHmr` on
  // the client): when the browser applies the hot update of an edited page
  // route, the live route runs the new options and keeps its split
  // component (no remount). The framework's refresh plugin, which makes the
  // module an HMR boundary and patches the component body, is not mounted:
  // the test applies the update the way Vite's HMR client does (the new
  // module evaluates with the hot data of the old one, then the old one's
  // accept callback gets it).
  // Source: mutation round 3 start-router I/J (spc:6046).
  test(
    'a hot update of an edited page route applies its new options to the live route and keeps its split component',
    async () => {
      const page = (marker: string) =>
        `${head}export const Route = createFileRoute('/page')({ loader: () => '${marker}', component: () => 'MARK_PAGE' })\n`
      const server = await startDevServer({
        start: {},
        files: {
          'src/routes/page.tsx': page('MARK_LOADER_V1'),
          'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
        },
      })
      /** The hot data of each module, and the accept callbacks. */
      const hotData = new Map<string, Record<string, unknown>>()
      const accepted: Array<(module: unknown) => void> = []
      const viteClient = {
        createHotContext: (ownerPath: string) => {
          const data = hotData.get(ownerPath) ?? {}
          hotData.set(ownerPath, data)
          return {
            data,
            accept: (callback?: (module: unknown) => void) => {
              if (typeof callback === 'function') {
                accepted.push(callback)
              }
            },
            acceptExports() {},
            dispose() {},
            prune() {},
            invalidate() {},
            on() {},
            off() {},
            send() {},
          }
        },
      }
      /** Evaluates the served page route module, as the browser loads it. */
      const loadPage = async () =>
        (
          await evaluateServed(server, '/src/routes/page.tsx', {
            skip: /^\/@vite\b/,
            stubs: { '/@vite/client': viteClient },
          })
        ).Route as {
          options: { loader: () => unknown; component: unknown }
        }
      const global = globalThis as Record<string, unknown>
      const hadWindow = 'window' in global
      const browser: Record<string, unknown> = {}
      global.window = browser
      onTestFinished(() => {
        if (!hadWindow) {
          delete global.window
        }
      })

      const live = await loadPage()
      const component = live.options.component
      // The router the page created (`window.__TSR_ROUTER__`)
      browser.__TSR_ROUTER__ = {
        routesById: { '/page': live },
        _replaceRouteChunk() {},
        buildRouteTree() {},
        setRoutes() {},
        resolvePathCache: new Map(),
      }
      expect(live.options.loader()).toBe('MARK_LOADER_V1')

      const messages = await server.edit({
        'src/routes/page.tsx': page('MARK_LOADER_V2'),
      })
      // An edit of a client route module: the client is told
      expect(
        messages.filter((message) => message.environment === 'client'),
      ).not.toEqual([])
      const callbacks = [...accepted]
      const updated = await loadPage()
      for (const callback of callbacks) {
        callback({ Route: updated })
      }

      expect(callbacks).not.toEqual([])
      expect(live.options.loader()).toBe('MARK_LOADER_V2')
      expect(live.options.component).toBe(component)
    },
    timeout,
  )
})
