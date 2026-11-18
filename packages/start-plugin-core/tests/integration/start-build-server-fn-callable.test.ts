// Slow-tier: real builds. Which server fns answer an HTTP call by id in a
// production build (SPEC J4.2, R182), beside the rows of
// start-build-server-fn-cases.test.ts.
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'

describe.each(startBundlers)('%s build', (bundler) => {
  const timeout = 60_000

  // On main, a server fn private to a module whose other server fn the
  // client calls (a helper only that server fn's handler calls) is callable
  // over HTTP by its id: the client's compile of the module registers it,
  // although the client code it emits does not call it.
  // SPEC J4.2 (R182): only server fns whose client call survives in the
  // client bundle are HTTP-callable; server code still calls the others.
  test(
    'SSR: a server fn private to a module the client imports is not callable over HTTP, and its own module calls it',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'fns.ts': `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
const privateFn = createServerFn().handler(async () => 'private fn')
export const publicFn = createServerFn().handler(async () => 'public:' + (await privateFn()))
export const privateFnUrl = createServerOnlyFn(() => privateFn.url)
`,
          'client-entry.ts': `export { publicFn } from './fns'\n`,
          'ssr-entry.ts': `export { publicFn, privateFnUrl } from './fns'
${callByIdExports}`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      })
      const publicUrl = (await client.run(`return entry.publicFn.url`)).result
      const { result } =
        await ssr.run(`${callByIdPrelude}const settle = async (run) => {
  try {
    return await run()
  } catch {
    return 'rejected'
  }
}
const overHttp = (id) => settle(async () => callById(id))
return {
  publicOverHttp: await overHttp(serverFnId(${JSON.stringify(publicUrl)})),
  privateOverHttp: await overHttp(serverFnId(entry.privateFnUrl())),
  publicFromSsr: await settle(() => entry.publicFn()),
}`)
      expect(result).toEqual({
        publicOverHttp: 'public:private fn',
        privateOverHttp: 'rejected',
        publicFromSsr: 'public:private fn',
      })
    },
    timeout,
  )

  // On main, an exported server fn the client never calls, in a module the
  // client imports, stays in the client bundle: its stub
  // (`createServerFn()….handler(createClientRpc(id))`) is a call bundlers
  // keep, so its id stays in the bundle and HTTP-callable (R182). The stub
  // is now a call the bundler may drop when its value is unused, while the
  // user's chain it wraps still runs: here `track()` in a link's argument
  // (a callee position of `.handler()`, which a pure annotation on the
  // user's own call would drop) and in the options of a stored builder.
  test(
    'client: an exported server fn the client never calls leaves the client bundle and is refused over HTTP, and the user code of its chain still runs',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'track.ts': `export const track = <T>(tag: string, value: T): T => {
  ;((globalThis as any).MARK_TRACKED ??= []).push(tag)
  return value
}
`,
          'fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { track } from './track'
const base = createServerFn(track('base', { method: 'POST' }))
export const usedFn = createServerFn()
  .middleware(track('used', []))
  .handler(async () => 'used fn')
export const unusedFn = createServerFn()
  .middleware(track('unused', []))
  .handler(async () => 'unused fn')
export const unusedFromBase = base.handler(async () => 'unused from base')
export const usedFromBase = base.handler(async () => 'used from base')
`,
          'client-entry.ts': `export { usedFn, usedFromBase } from './fns'
export const tracked = () => (globalThis as any).MARK_TRACKED
`,
          'ssr-entry.ts': `export { usedFn, unusedFn, unusedFromBase, usedFromBase } from './fns'
${callByIdExports}`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      })
      const { result: fromClient } = await client.run(
        `return { tracked: entry.tracked(), used: entry.usedFn.url, usedFromBase: entry.usedFromBase.url, method: entry.usedFromBase.method }`,
      )
      const { result } =
        await ssr.run(`${callByIdPrelude}const settle = async (run) => {
  try {
    return await run()
  } catch {
    return 'rejected'
  }
}
const overHttp = (fn) =>
  settle(async () => callById(serverFnId(fn.url), undefined, fn.method))
return {
  ids: [entry.unusedFn, entry.unusedFromBase].map((fn) => serverFnId(fn.url)),
  used: await overHttp(entry.usedFn),
  usedFromBase: await overHttp(entry.usedFromBase),
  unused: await overHttp(entry.unusedFn),
  unusedFromBase: await overHttp(entry.unusedFromBase),
  unusedFromSsr: await settle(() => entry.unusedFn()),
}`)
      const { ids, ...calls } = result as { ids: Array<string> }
      expect({
        fromClient,
        calls,
        unusedIdsInClient: ids.filter(
          (id) =>
            client.locate(id).eager.length + client.locate(id).lazy.length > 0,
        ),
      }).toEqual({
        fromClient: {
          tracked: ['base', 'used', 'unused'],
          used: expect.any(String),
          usedFromBase: expect.any(String),
          method: 'POST',
        },
        calls: {
          used: 'used fn',
          usedFromBase: 'used from base',
          unused: 'rejected',
          unusedFromBase: 'rejected',
          unusedFromSsr: 'unused fn',
        },
        unusedIdsInClient: [],
      })
    },
    timeout,
  )

  // SPEC J4.2 (R182), each build deciding: a rebuild after an edit that
  // removes the last client call of a server fn refuses it over HTTP, and
  // one that calls it again answers it (Rsbuild from its persistent cache).
  test(
    'SSR: a rebuild follows the edits that remove and restore the last client call of a server fn',
    async () => {
      const fns = (
        clientCalls: boolean,
      ) => `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
const helperFn = createServerFn().handler(async () => 'helper fn')
export const publicFn = createServerFn().handler(async () => 'public:' + (await helperFn()))
export const helperFnUrl = createServerOnlyFn(() => helperFn.url)
${clientCalls ? 'export const callHelper = () => helperFn()\n' : ''}`
      const overHttp = (build: Awaited<ReturnType<typeof buildStart>>) =>
        build.ssr.run(`${callByIdPrelude}try {
  return await callById(serverFnId(entry.helperFnUrl()))
} catch {
  return 'rejected'
}`)
      const cold = await buildStart({
        bundler,
        rsbuildConfig: { performance: { buildCache: true } },
        files: {
          'fns.ts': fns(true),
          'client-entry.ts': `export * from './fns'\n`,
          'ssr-entry.ts': `export { publicFn, helperFnUrl } from './fns'
${callByIdExports}`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      })
      // (each build's server read before the next one writes its directory)
      const coldCall = (await overHttp(cold)).result
      const removed = await cold.rebuild({ 'fns.ts': fns(false) })
      const removedCall = (await overHttp(removed)).result
      const restored = await removed.rebuild({ 'fns.ts': fns(true) })
      expect({
        cold: coldCall,
        removed: removedCall,
        restored: (await overHttp(restored)).result,
      }).toEqual({
        cold: 'helper fn',
        removed: 'rejected',
        restored: 'helper fn',
      })
    },
    timeout,
  )
})
