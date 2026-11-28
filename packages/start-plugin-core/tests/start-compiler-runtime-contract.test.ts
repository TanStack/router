/**
 * One module through the whole of Start's runtime, served by the public
 * Start host (`./start-host`): a server fn with a function middleware and
 * an isomorphic fn, called from the client in a real page (Start's client
 * RPC sends its request to the dev server, whose server entry runs the
 * middleware and the handler) and from server code in a real request; and
 * a failing handler, whose error reaches both callers. The same module in a
 * Solid app.
 * Source: review.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import {
  callFromClient,
  callOnServer,
  createStartHost,
  inPage,
  serveCase,
} from './regression-helpers'
import type { StartHost } from './start-host'

let host: StartHost
beforeAll(async () => {
  host = await createStartHost()
  return () => host.close()
}, 60_000)
let solidHost: StartHost
beforeAll(async () => {
  solidHost = await createStartHost({ framework: 'solid' })
  return () => solidHost.close()
}, 60_000)
beforeAll(async () => {
  await host.page()
}, 60_000)

describe('a module with a server fn, a function middleware and an isomorphic fn', () => {
  const code = `import { createIsomorphicFn, createMiddleware, createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const where = createIsomorphicFn().server(() => 'server').client(() => 'client')
export const auth = createMiddleware({ type: 'function' })
  .validator((data: { n: number }) => ({ n: data.n + 1 }))
  .client(({ next }) => next({ sendContext: { from: where() } }))
  .server(({ next, context }) => next({ context: { user: db.user(context.from) ?? 'MARK_MIDDLEWARE_SERVER' } }))
export const getUser = createServerFn({ method: 'POST' })
  .middleware([auth])
  .handler(async ({ data, context, method, serverFnMeta }) => ({
    n: data.n,
    user: context.user,
    method,
    name: serverFnMeta.name,
    where: where(),
  }))
export const env = () => where()`
  const files = {
    'db.server.ts': `export const db = { user: (from: string) => \`user-from-\${from}\` }\n`,
  }

  test('runs on Start’s runtime from the client and from server code', async () => {
    const served = await serveCase(host, {
      'module.tsx': code,
      ...files,
    })
    expect(served.code.client).not.toContain('MARK_MIDDLEWARE_SERVER')
    const expected = (from: string) => ({
      n: 2,
      user: `user-from-${from}`,
      method: 'POST',
      name: 'getUser',
      where: 'server',
    })
    // The client: its middleware's `.client()` runs in the browser.
    expect(
      await inPage(
        served,
        `return { env: module.env(), url: typeof module.getUser.url }`,
      ),
    ).toEqual({ env: 'client', url: 'string' })
    expect(await callFromClient(served, 'module.getUser', { n: 1 })).toEqual(
      expected('client'),
    )
    // Server code: `.client()` runs on the server, then the handler.
    expect((await served.ssr()).env()).toBe('server')
    expect(await callOnServer(served, 'module.getUser', { n: 1 })).toEqual(
      expected('server'),
    )
  })

  // The factories of `@tanstack/solid-start` (SPEC J4.5), in a Solid app.
  test('runs on Start’s runtime in a Solid app', async () => {
    const served = await serveCase(solidHost, {
      'module.tsx': code.replace(
        "from '@tanstack/react-start'",
        "from '@tanstack/solid-start'",
      ),
      ...files,
    })
    expect(served.code.client).not.toContain('MARK_MIDDLEWARE_SERVER')
    expect(await inPage(served, `return module.env()`)).toBe('client')
    expect(await callFromClient(served, 'module.getUser', { n: 1 })).toEqual({
      n: 2,
      user: 'user-from-client',
      method: 'POST',
      name: 'getUser',
      where: 'server',
    })
    expect((await served.ssr()).env()).toBe('server')
  })

  // An HTTP call by id without client context: a request that is not Start's
  // client RPC, here the progressive-enhancement form post Start documents
  // (`FormData` sent to the server fn's public `url`, as an HTML form without
  // JavaScript does), so no client middleware runs and no client context is
  // sent. Start's server entry finds the handler by the id in the URL and
  // runs the server middleware and the handler with the request's data,
  // method and an empty client context. The handler answers with a
  // `Response` (documented "Raw Responses"), which reaches the caller as is.
  // Source: the former leg "an HTTP call by id" of "runs on Start’s runtime
  // from the client, the SSR caller and an HTTP call by id" (that leg called
  // the provider's export directly, so it was dropped).
  test('an HTTP call by id without client context runs the server middleware and the handler', async () => {
    const served = await serveCase(host, {
      'module.tsx': `import { createIsomorphicFn, createMiddleware, createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const where = createIsomorphicFn().server(() => 'server').client(() => 'client')
export const auth = createMiddleware({ type: 'function' })
  .client(({ next }) => next({ sendContext: { from: where() } }))
  .server(({ next, context }) => next({ context: { user: db.user(context.from) ?? 'MARK_MIDDLEWARE_SERVER' } }))
export const submit = createServerFn({ method: 'POST' })
  .middleware([auth])
  .validator((data: FormData) => ({ n: Number(data.get('n')) + 1 }))
  .handler(async ({ data, context, method, serverFnMeta }) =>
    Response.json({
      n: data.n,
      user: context.user,
      method,
      name: serverFnMeta.name,
      where: where(),
    }),
  )`,
      ...files,
    })
    expect(served.code.client).not.toContain('MARK_MIDDLEWARE_SERVER')
    expect(
      await inPage(
        served,
        `const body = new FormData()
body.set('n', '1')
const response = await fetch(module.submit.url, { method: 'POST', body })
return { status: response.status, body: await response.json() }`,
      ),
    ).toEqual({
      status: 200,
      body: {
        n: 2,
        user: 'user-from-undefined',
        method: 'POST',
        name: 'submit',
        where: 'server',
      },
    })
  })

  // Source: the former test "a failing handler answers { error }, which
  // Start’s handler rethrows" (the error reaching the callers is the
  // concept; the `{ error }` answer of a provider export is internal).
  test('a failing handler’s error reaches the client and the server caller', async () => {
    const served = await serveCase(host, {
      'module.tsx': `import { createServerFn } from '@tanstack/react-start'
export const fail = createServerFn().handler(async () => {
  throw new Error('handler failed')
})`,
    })
    await expect(callFromClient(served, 'module.fail')).rejects.toThrow(
      'handler failed',
    )
    await expect(callOnServer(served, 'module.fail')).rejects.toThrow(
      'handler failed',
    )
  })
})
