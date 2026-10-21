/**
 * One module through the whole of Start's runtime, served by the public
 * Start host (`./start-host`): a server fn with a function middleware and
 * an isomorphic fn, called from the client in a real page (Start's client
 * RPC sends its request to the dev server, whose server entry runs the
 * middleware and the handler) and from server code in a real request; and
 * a failing handler, whose error reaches both callers.
 * The controls of the former in-process stand-ins (the client RPC without
 * its fetch, the SSR RPC behind the server-fn report, the `{ error }` answer
 * of a provider) moved to outside-compiler-corpus/
 * start-compiler-runtime-contract.test.ts: the corpus no longer uses them.
 * Source: audit E1 missing coverage 1.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import {
  callFromClient,
  callOnServer,
  inPage,
  serveCase,
  useStartHost,
} from './regression-helpers'

const host = useStartHost()
beforeAll(async () => {
  await (await host()).page()
}, 60_000)

describe('a module with a server fn, a function middleware and an isomorphic fn', () => {
  const code = `import { createIsomorphicFn, createMiddleware, createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const where = createIsomorphicFn().server(() => 'server').client(() => 'client')
export const auth = createMiddleware({ type: 'function' })
  .validator((data: { n: number }) => ({ n: data.n + 1 }))
  .client(({ next }) => next({ sendContext: { from: where() } }))
  .server(({ next, context }) => next({ context: { user: db.user(context.from) } }))
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
    const served = await serveCase(await host(), {
      'module.tsx': code,
      ...files,
    })
    expect(served.code.client).not.toContain('db.user')
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

  // Source: the former test "a failing handler answers { error }, which
  // Start’s handler rethrows" (S4 B-mixed: the error reaching the callers is
  // the concept; the `{ error }` answer of a provider export is internal).
  test('a failing handler’s error reaches the client and the server caller', async () => {
    const served = await serveCase(await host(), {
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
