/**
 * A server function's lazy handler module (`?tss-serverfn-handler`) runs
 * after its route file: the memoised loader lives in the module defining
 * the function (D6, R66), so a request the HTTP resolver answers first, on a
 * fresh server that rendered no page, evaluates the route file before the
 * handler module. Route splitting relies on it: an import nothing in the
 * route file references (`import './polyfill'`, CSS) runs with the route
 * file and is not repeated in the handler module.
 */
import { describe, expect, test } from 'vitest'
import {
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import { buildStart } from '../build-start'
import { routeFiles } from './start-build-route-app'

const timeout = 60_000

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    "a server function called over HTTP on a fresh server sees its route file's bare import",
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          ...routeFiles,
          'src/polyfill.ts': `;(globalThis as any).__poly = 'MARK_POLY'
export {}
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import '../polyfill'
export const readPoly = createServerFn().handler(
  async () => 'MARK_HANDLER:' + String((globalThis as any).__poly),
)
export const Route = createFileRoute('/')({
  loader: () => readPoly(),
  component: () => 'MARK_COMPONENT',
})
`,
          'src/client-entry.ts': `export { readPoly } from './routes/index'\n`,
          // the server answers the request alone: no router, no route file
          'src/ssr-entry.ts': callByIdExports,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      // the handler is its own module, loaded on the first call
      expect(ssr.where('MARK_HANDLER')).toBe('lazy')
      const url = (await client.run(`return entry.readPoly.url`)).result
      const { result } = await ssr.run(
        `${callByIdPrelude}return callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_HANDLER:MARK_POLY')
    },
    timeout,
  )
})
