/**
 * A server fn nested in another server fn's handler is server-only: no
 * client code can reference it (the enclosing handler is a stub on the
 * client), so a production build does not list it among the HTTP-callable
 * functions (SPEC J4.2, J4.6), whichever import binding of the factory
 * declares it. Vite and Rsbuild builds, Start's whole plugin, the server
 * bundle run by Start's own server entry inside a real request.
 */
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'

const timeout = 60_000

const files = {
  'fns.ts': `import { createServerFn as inner } from '@tanstack/react-start'
import { createServerFn } from '@tanstack/react-start'
export const outer = createServerFn().handler(async () => {
  const nested = inner().handler(async () => 'MARK_NESTED')
  ;(globalThis as any).__nested = nested
  return nested()
})
`,
  'client-entry.ts': `export { outer } from './fns'
`,
  'ssr-entry.ts': `export { outer } from './fns'
${callByIdExports}`,
}

describe.each(startBundlers)('a %s production build', (bundler) => {
  test(
    'a server fn nested in a handler is callable by the handler and not over HTTP',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      })
      expect(client.where('MARK_NESTED')).toBe('nowhere')
      const outerUrl = (await client.run(`return entry.outer.url`)).result
      const { result } =
        await ssr.run(`${callByIdPrelude}const settle = async (run) => {
  try {
    return await run()
  } catch {
    return 'rejected'
  }
}
const outer = await settle(() => callById(serverFnId(${JSON.stringify(outerUrl)})))
const nestedId = serverFnId(globalThis.__nested)
return { outer, nestedOverHttp: await settle(() => callById(nestedId)) }`)
      expect(result).toEqual({
        outer: 'MARK_NESTED',
        nestedOverHttp: 'rejected',
      })
    },
    timeout,
  )
})
