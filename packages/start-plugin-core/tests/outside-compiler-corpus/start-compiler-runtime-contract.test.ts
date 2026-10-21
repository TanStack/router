/**
 * OUTSIDE THE COMPILER CORPUS (implementation controls). Moved unchanged
 * (imports aside) from tests/start-compiler-runtime-contract.test.ts:
 * - ":33" and ":44": contract tests of the in-process stand-ins of the
 *   legacy harness (`./legacy/regression-helpers`: the client RPC without
 *   its fetch, the SSR RPC calling the handler the server-fn report names);
 *   the corpus no longer uses them (S4: B-impl, move-out);
 * - ":88" and ":122": the same module run through the legacy harness, kept
 *   as its control; ":122" asserts the `{ error }` answer of a provider
 *   export, an internal protocol (S4: B-mixed, the `{ error }` shape moves
 *   out).
 * The corpus tests deciding the outcomes are in
 * tests/start-compiler-runtime-contract.test.ts (the public Start host).
 */
import { describe, expect, test } from 'vitest'
import { createClientRpc, createSsrRpc } from '../start-runtime'
import {
  callFromClient,
  callProvider,
  callerRpcId,
  compileAll,
  createServerGraph,
  evaluateModule,
  serverFnResult,
} from './legacy/regression-helpers'

/** Own properties (symbols included) of a value, without functions. */
function metadata(value: object) {
  return Object.fromEntries(
    Reflect.ownKeys(value)
      .filter((key) => !['length', 'name', 'prototype'].includes(String(key)))
      .map((key) => [key, (value as Record<PropertyKey, unknown>)[key]]),
  )
}

describe('the stand-ins carry what Start creates', () => {
  test('a client RPC is Start’s own, without the fetch', async () => {
    const { rpc } =
      await evaluateModule(`import { createClientRpc } from '@tanstack/react-start/client-rpc'
export const rpc = createClientRpc('id-1')`)
    const real = createClientRpc('id-1')
    expect(rpc).toBeTypeOf('function')
    expect(metadata(rpc)).toEqual(metadata(real))
    expect(metadata(real)).toMatchObject({ serverFnMeta: { id: 'id-1' } })
    expect(() => rpc()).toThrow('no server to fetch')
  })

  test('an SSR RPC is Start’s own, calling the handler the report names', async () => {
    const provider = `import { createServerRpc } from '@tanstack/react-start/server-rpc'
export const handler = createServerRpc({ id: 'id-1', name: 'fn' }, (opts) => ({ result: opts.data }))`
    const { rpc } = await createServerGraph({
      ssr: `import { createSsrRpc } from '@tanstack/react-start/ssr-rpc'
export const rpc = createSsrRpc('id-1')`,
      provider,
      serverFns: {
        'id-1': {
          functionId: 'id-1',
          functionName: 'handler',
          filename: '/test/src/module.tsx',
          extractedFilename: '/test/src/module.tsx?tss-serverfn-split',
        },
      },
    }).ssr()
    expect(metadata(rpc)).toEqual(metadata(createSsrRpc('id-1')))
    // Start's createSsrRpc forwards its arguments to the resolved handler.
    expect(await rpc({ data: 'data' })).toEqual({ result: 'data' })
  })
})

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
  const stubs = {
    './db.server': { db: { user: (from: string) => `user-from-${from}` } },
  }

  test('runs on Start’s runtime from the client, the SSR caller and an HTTP call by id', async () => {
    const compiled = await compileAll(code)
    expect(compiled.client).not.toContain('db.user')
    const expected = (from: string) => ({
      n: 2,
      user: `user-from-${from}`,
      method: 'POST',
      name: 'getUser',
      where: 'server',
    })
    // The client: its middleware's `.client()` runs in the browser.
    const client = await evaluateModule(compiled.client, stubs)
    expect(client.env()).toBe('client')
    expect(callerRpcId(client.getUser)).toEqual(expect.any(String))
    expect(
      await callFromClient(
        compiled,
        (module) => module.getUser,
        { n: 1 },
        stubs,
      ),
    ).toEqual(expected('client'))
    // The SSR caller: `.client()` runs on the server, then the handler.
    const ssr = await createServerGraph(compiled, stubs).ssr()
    expect(ssr.env()).toBe('server')
    expect(await ssr.getUser({ data: { n: 1 } })).toEqual(expected('server'))
    // An HTTP call by id (Start's server-fn handler calls the provider's
    // export with the data, context and method of the request; this one
    // sends no client context).
    expect(await callProvider(compiled, 'getUser', stubs, { n: 1 })).toEqual(
      expected('undefined'),
    )
  })

  test('a failing handler answers { error }, which Start’s handler rethrows', async () => {
    const compiled =
      await compileAll(`import { createServerFn } from '@tanstack/react-start'
export const fail = createServerFn().handler(async () => {
  throw new Error('handler failed')
})`)
    const graph = createServerGraph(compiled)
    // The handler the id the client calls names (the provider's other
    // exports, whatever they are, are not it).
    const [reported] = Object.values(compiled.serverFns)
    const handler = (await graph.import(reported!.extractedFilename))[
      reported!.functionName
    ]
    const response = await handler({ data: undefined })
    expect(response).toEqual({ error: new Error('handler failed') })
    expect(() => serverFnResult(response)).toThrow('handler failed')
    await expect((await graph.ssr()).fail()).rejects.toThrow('handler failed')
  })
})
