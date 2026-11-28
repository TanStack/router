/**
 * Start's Rsbuild build, a server function in a module the client gets as
 * its import-protection mock (H4): its handler is in no client code, its id
 * does not answer a client-origin call, the server still calls it. A mock
 * declares no server function (rule 1 of the Rsbuild host).
 * Source: hotspot 3 cross-review rows (review-hotspot3-fable-on-gemini.md,
 * H4).
 */
import { describe, expect, test } from 'vitest'
import { callByIdExports, callByIdPrelude } from '../../build-harness'
import { buildStart } from '../../build-start'

const timeout = 120_000

describe('rsbuild build: a server function in a module the client gets as its mock', () => {
  // H4. Is it a leak? The client reaches `secret.server.ts` by a pattern
  // import and gets its mock; the server imports the file. Neither the
  // handler's text is in the client's code, nor does a client-origin call
  // by the function's id answer (the client's emitted code calls nothing:
  // R182).
  test(
    'its handler is not in the client code and its id does not answer over HTTP',
    async () => {
      const { client, ssr } = await buildStart({
        bundler: 'rsbuild',
        start: { importProtection: { behavior: 'mock' } },
        files: {
          'src/secret/secret.server.ts': `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
export const secretFn = createServerFn().handler(async () => 'MARK_SECRET_HANDLER')
export const secretFnUrl = createServerOnlyFn(() => secretFn.url)
`,
          'src/entry.ts': `const name = 'secret.server'
export const load = () => import('./secret/' + name + '.ts')
`,
          'src/ssr-entry.ts': `export { secretFn, secretFnUrl } from './secret/secret.server'
${callByIdExports}`,
        },
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      const inClient = client.locate('MARK_SECRET_HANDLER')
      expect([...inClient.eager, ...inClient.lazy]).toEqual([])
      const { result } =
        await ssr.run(`${callByIdPrelude}const settle = async (run) => {
  try {
    return await run()
  } catch {
    return 'rejected'
  }
}
return {
  overHttp: await settle(async () => callById(serverFnId(entry.secretFnUrl()))),
  fromServer: await settle(() => entry.secretFn()),
}`)
      expect(result).toEqual({
        overHttp: 'rejected',
        fromServer: 'MARK_SECRET_HANDLER',
      })
    },
    timeout,
  )
})
