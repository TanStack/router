/**
 * Start's router wiring on a running Vite dev server, with Start's whole
 * Vite plugin (dev-server.ts `start`): the client route tree, which leaves
 * out server-only routes, follows edits that turn a route into a page or
 * into a server-only route.
 */
import { describe, expect, test } from 'vitest'
import { startDevServer } from './dev-server'
import type { HmrMessage } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const handlers = (text: string) =>
  `server: { handlers: { GET: () => new Response('${text}') } }`
/** `src/routes/api.tsx` with these route options. */
const api = (options: string) =>
  `${head}export const Route = createFileRoute('/api')({ ${options} })\n`
const component = `component: () => 'MARK_API_PAGE'`

/** The client environment's full page reloads among `messages`. */
const fullReloads = (messages: Array<HmrMessage>) =>
  messages
    .filter((message) => message.environment === 'client')
    .filter((message) => message.type === 'full-reload')
    .map((message) => message.paths)

describe('Vite dev: a route switching between page and server-only', () => {
  // Source: mutation round 3 start-router D (dev-server.ts mounted only the
  // compiler plugin, so Start's dev server hooks never ran).
  test(
    'the client route tree follows the edits, and the page reloads when it changes',
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
      const handlerEdit = await server.edit({
        'src/routes/api.tsx': api(handlers('y')),
      })
      expect(
        handlerEdit.filter((message) => message.environment === 'client'),
      ).toEqual([])

      // Server-only -> page
      const toPage = await server.edit({
        'src/routes/api.tsx': api(`${handlers('y')}, ${component}`),
      })
      expect(fullReloads(toPage)).toContainEqual(['*'])
      expect(await clientRoutes()).toContain('/src/routes/api.tsx')

      // Page with handlers -> page without handlers
      await server.edit({ 'src/routes/api.tsx': api(component) })
      expect(await clientRoutes()).toContain('/src/routes/api.tsx')

      // Page -> server-only
      const toApi = await server.edit({
        'src/routes/api.tsx': api(handlers('z')),
      })
      expect(fullReloads(toApi)).toContainEqual(['*'])
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
  // Start's client code splitting adds route HMR, so an edited route module
  // updates the live route in place (with the framework's refresh plugin,
  // which this harness does not mount, the edit is then a hot update). Like
  // route-hmr.test.ts "route HMR in a Vite dev server ...", this checks that
  // the served client route module takes part in HMR; the server's does not
  // need to.
  // Source: mutation round 3 start-router I/J (spc:6046).
  test(
    'the client route module of a split page route takes part in HMR',
    async () => {
      const server = await startDevServer({
        start: {},
        files: {
          'src/routes/page.tsx': `${head}export const Route = createFileRoute('/page')({ component: () => 'MARK_PAGE' })\n`,
        },
      })
      expect(await server.transform('/src/routes/page.tsx')).toMatch(
        /\bimport\.meta\.hot\b/,
      )
    },
    timeout,
  )
})
