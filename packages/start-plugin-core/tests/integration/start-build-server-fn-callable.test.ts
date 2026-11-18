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

  // SPEC J4.2 (R182) with default and custom ids in one build: a custom id
  // a public one extends (`fn`, `fnx`), one with a quote (`it's`, escaped in
  // a literal of that quote) and default ids. Each public fn answers over
  // HTTP, each private one is refused.
  test(
    'SSR: default and custom ids gate their own server fns',
    async () => {
      const ids: Record<string, string> = {
        privatePrefix_createServerFn_handler: 'fn',
        publicLonger_createServerFn_handler: 'fnx',
        publicQuote_createServerFn_handler: "it's",
      }
      const { ssr } = await buildStart({
        bundler,
        start: {
          serverFns: {
            generateFunctionId: ({ functionName }: { functionName: string }) =>
              ids[functionName],
          },
        },
        files: {
          'fns.ts': `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
const privatePrefix = createServerFn().handler(async () => 'private prefix')
const privateDefault = createServerFn().handler(async () => 'private default')
export const publicLonger = createServerFn().handler(async () => 'public longer:' + (await privatePrefix()) + (await privateDefault()))
export const publicQuote = createServerFn().handler(async () => 'public quote')
export const publicDefault = createServerFn().handler(async () => 'public default')
export const urls = createServerOnlyFn(() => [privatePrefix, privateDefault, publicLonger, publicQuote, publicDefault].map((fn) => fn.url))
`,
          'client-entry.ts': `export { publicLonger, publicQuote, publicDefault } from './fns'\n`,
          'ssr-entry.ts': `export { urls } from './fns'
${callByIdExports}`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      })
      const { result } =
        await ssr.run(`${callByIdPrelude}const overHttp = async (url) => {
  try {
    return await callById(serverFnId(url))
  } catch {
    return 'rejected'
  }
}
const results = []
for (const url of entry.urls()) {
  results.push([serverFnId(url), await overHttp(url)])
}
return results`)
      const [privatePrefix, privateDefault, ...publics] = result as Array<
        [string, string]
      >
      expect({ privatePrefix, privateDefault, publics }).toEqual({
        privatePrefix: ['fn', 'rejected'],
        privateDefault: [expect.any(String), 'rejected'],
        publics: [
          ['fnx', 'public longer:private prefixprivate default'],
          ["it's", 'public quote'],
          [expect.any(String), 'public default'],
        ],
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
