/**
 * Two inputs of the V2 review in one real Vite production build through
 * Start's plugin (build-harness.ts), next to their compiler-level rows in
 * start-compiler-v2-inputs.test.ts:
 * - `.jsx` modules (SPEC §2.1, J4.1, J2.1): a `.jsx` server fn module with
 *   JSX, and a `.jsx` route file whose component is split;
 * - a server fn builder reused as middleware (J4.5, J4.8):
 *   `createServerFn().middleware([auth])` passed in another server fn's
 *   `.middleware([...])`.
 * Source: FIX-PLAN V2-11 (start-fable SF-19; 532 corpus files), V2-25
 * (start-fable SF-6).
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
} from '../build-harness'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const files = {
  'src/db.server.js': `export const db = { user: () => 'MARK_USER' }\n`,
  'src/fns.jsx': `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const getUser = createServerFn().handler(async () => db.user())
export function Badge({ name }) {
  return <span className="badge">{name}</span>
}
`,
  'src/routes/index.jsx': `import { createFileRoute } from '@tanstack/react-router'
import { Badge } from '../fns'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <main>MARK_JSX_PAGE <Badge name="Ada" /></main>
}
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/audit.server.ts': `export const audit = () => 'MARK_AUDIT_USER'\n`,
  'src/builders.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { audit } from './audit.server'
export const auth = createMiddleware({ type: 'function' })
  .client(({ next }) => {
    ;(((globalThis as Record<string, unknown>).__clientCalls ??= []) as Array<string>).push('auth')
    return next()
  })
  .server(({ next }) => next({ context: { user: audit() } }))
const authed = createServerFn().middleware([auth])
export const whoAmI = createServerFn()
  .middleware([authed])
  .handler(async ({ context }) => context.user)
`,
  'src/client-entry.ts': `export { getUser, Badge } from './fns'
export { whoAmI } from './builders'
export { getRouter } from './router'
export { createElement, renderPath, renderToString } from '../harness/render'
`,
  'src/ssr-entry.ts': `export * from './client-entry'
${callByIdExports}`,
}

// One build for both rows.
let build: StartBuild
let dispose: (() => Promise<void>) | undefined
beforeAll(async () => {
  build = await buildStart({
    files,
    entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
    registerCleanup: (cleanup) => {
      dispose = cleanup
    },
  })
}, timeout)
afterAll(() => dispose?.())

test(
  'vite build: a .jsx server fn module and a .jsx route file: the client calls by id without the handler, the route component is lazy and renders (V2-11)',
  async () => {
    const { client, ssr } = build
    expect({
      handler: client.where('MARK_USER'),
      page: client.where('MARK_JSX_PAGE'),
    }).toEqual({ handler: 'nowhere', page: 'lazy' })
    const clientRun = (
      await client.run(`${requestsOfPrelude}return {
  id: entry.getUser.serverFnMeta.id,
  url: entry.getUser.url,
  requests: await requestsOf(entry.getUser),
  badge: entry.renderToString(entry.createElement(entry.Badge, { name: 'Ada' })),
  page: await entry.renderPath(entry.getRouter().routeTree, '/'),
}`)
    ).result as {
      id: string
      url: string
      requests: Array<unknown>
      badge: string
      page: string
    }
    expect(clientRun.requests).toEqual([{ url: clientRun.url, method: 'GET' }])
    expect(clientRun.badge).toBe('<span class="badge">Ada</span>')
    expect(clientRun.page).toContain(
      'MARK_JSX_PAGE <span class="badge">Ada</span>',
    )
    const { result } = await ssr.run(`${callByIdPrelude}return {
  byId: await callById(${JSON.stringify(clientRun.id)}),
  page: await entry.renderPath(entry.getRouter().routeTree, '/'),
}`)
    expect(result).toEqual({
      byId: 'MARK_USER',
      page: expect.stringContaining(
        'MARK_JSX_PAGE <span class="badge">Ada</span>',
      ),
    })
  },
  timeout,
)

test(
  'vite build: a server fn builder reused as middleware: the client runs auth.client() and has no auth.server() code; the server runs auth.server() then the handler (V2-25)',
  async () => {
    const { client, ssr } = build
    expect(client.where(/MARK_AUDIT_USER|audit\.server/)).toBe('nowhere')
    const clientRun = (
      await client.run(`${requestsOfPrelude}const requests = await requestsOf(entry.whoAmI)
return {
  id: entry.whoAmI.serverFnMeta.id,
  requests: requests.length,
  clientCalls: globalThis.__clientCalls,
}`)
    ).result as { id: string; requests: number; clientCalls: Array<string> }
    expect(clientRun.requests).toBe(1)
    expect(clientRun.clientCalls).toEqual(['auth'])
    const { result } = await ssr.run(`${callByIdPrelude}return {
  byId: await callById(${JSON.stringify(clientRun.id)}),
  ssr: await entry.whoAmI(),
}`)
    expect(result).toEqual({ byId: 'MARK_AUDIT_USER', ssr: 'MARK_AUDIT_USER' })
  },
  timeout,
)
