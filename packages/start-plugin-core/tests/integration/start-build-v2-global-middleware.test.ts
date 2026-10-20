/**
 * Global middleware of `createStart` in real production builds through
 * Start's Vite and Rsbuild plugins (build-harness.ts): `src/start.ts` lists
 * a function middleware with a `.client()` and a `.server()` that reads a
 * server-only module, and a request middleware reading another one. The
 * client bundle has no server code of either (SPEC J4.8, J4.12); a client
 * call of a server fn without middleware of its own runs the global
 * `.client()` once; the server runs the global `.server()` for an HTTP call
 * by id; the request middleware runs for the SSR page (rendered by Start's
 * own server entry) and for the HTTP call.
 * Source: FIX-PLAN V2-09 (start-fable MW-5; `functionMiddleware` in 179,
 * `requestMiddleware` in 697 corpus files).
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import {
  openAppPage,
  rootDocument,
  serveStartBuild,
  startPageEntries,
} from './start-compose-app'

const timeout = 60_000

const files = {
  ...startPageEntries,
  'src/routes/__root.tsx': rootDocument(),
  'src/audit.server.ts': `export const audit = () => 'MARK_AUDIT_SERVER'\n`,
  'src/auth.server.ts': `export const authenticate = (_request: Request) => 'MARK_AUTH_USER'\n`,
  'src/middleware.ts': `import { createMiddleware } from '@tanstack/react-start'
import { audit } from './audit.server'
import { authenticate } from './auth.server'
export const log = createMiddleware({ type: 'function' })
  .client(({ next }) => {
    ;(((globalThis as Record<string, unknown>).__clientLog ??= []) as Array<string>).push('log')
    return next()
  })
  .server(({ next }) => next({ context: { audited: audit() } }))
export const auth = createMiddleware({ type: 'request' }).server(
  ({ next, request }) => next({ context: { user: authenticate(request) } }),
)
`,
  'src/start.ts': `import { createStart } from '@tanstack/react-start'
import { auth, log } from './middleware'
export const startInstance = createStart(() => ({
  requestMiddleware: [auth],
  functionMiddleware: [log],
}))
`,
  // A server fn with no middleware of its own. (Its handler's `context`
  // type does not carry the global middleware's context: the e2e apps cast
  // it the same way.)
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const whoAmI = createServerFn().handler(async ({ context }) => {
  const globalContext = context as unknown as { audited: string; user: string }
  return [globalContext.audited, globalContext.user]
})
`,
  'src/routes/index.tsx': `import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { whoAmI } from '../fns'
export const Route = createFileRoute('/')({
  loader: () => whoAmI(),
  component: Page,
})
function Page() {
  const [called, setCalled] = useState('')
  return <><p>{Route.useLoaderData().join(' ')}</p><button data-testid="call" onClick={() => whoAmI().then((value) => setCalled(value.join(' ')))}>call</button><p data-testid="called">{called}</p></>
}
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/client-entry.ts': `export { whoAmI } from './fns'\n`,
  'src/ssr-entry.ts': `export { whoAmI } from './fns'
${callByIdExports}`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'global function and request middleware: no server code in the client, .client() runs on a client call, .server() and the request middleware run on the server',
    async () => {
      const build = await buildStart({
        bundler,
        files,
        registerCleanup: onTestFinished,
      })
      const { client, ssr } = build
      expect({
        audit: client.where('MARK_AUDIT_SERVER'),
        auth: client.where('MARK_AUTH_USER'),
        modules: client.where(/audit\.server|auth\.server/),
      }).toEqual({ audit: 'nowhere', auth: 'nowhere', modules: 'nowhere' })
      const served = await serveStartBuild(build, {
        registerCleanup: onTestFinished,
      })
      const page = await openAppPage(served, '/', {
        registerCleanup: onTestFinished,
      })
      const requests: Array<{ url: string; method: string }> = []
      page.page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/_serverFn/')) {
          requests.push({
            url: url.pathname + url.search,
            method: request.method(),
          })
        }
      })
      await page.page.locator('[data-testid=call]').click()
      await page.waitForText('MARK_AUDIT_SERVER MARK_AUTH_USER', {
        selector: '[data-testid=called]',
      })
      expect(
        await page.page.evaluate(() => (globalThis as any).__clientLog),
      ).toEqual(['log'])
      expect(page.serverFnRequests).toHaveLength(1)
      expect(page.errors).toEqual([])
      const { id, url } = await page.page.evaluate(() => {
        const fn = (globalThis as any).__app.whoAmI
        return { id: fn.serverFnMeta.id, url: fn.url }
      })
      expect(requests).toEqual([{ url, method: 'GET' }])
      const { result } =
        await ssr.run(`${callByIdPrelude}const response = await entry.startServerEntry.fetch(
  new Request('http://localhost/'),
)
return {
  byId: await callById(${JSON.stringify(id)}),
  page: { status: response.status, html: await response.text() },
}`)
      const { byId, page: renderedPage } = result as {
        byId: unknown
        page: { status: number; html: string }
      }
      expect(byId).toEqual(['MARK_AUDIT_SERVER', 'MARK_AUTH_USER'])
      expect(renderedPage.status).toBe(200)
      expect(renderedPage.html).toContain('MARK_AUDIT_SERVER MARK_AUTH_USER')
    },
    timeout,
  )
})
