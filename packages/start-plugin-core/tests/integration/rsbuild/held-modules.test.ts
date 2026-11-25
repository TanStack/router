/**
 * An Rsbuild build holding two modules of one file in one environment: the
 * client compilation's and a worker's child compilation's (`./worker-plugin`,
 * run while the client compilation makes its modules or once it is done, so
 * either module's compile ends last; once done, its output is not written). Each module records what it served,
 * and a build on the persistent cache (`performance.buildCache`) is the
 * clean build: the server answers the client's call, the worker calls the
 * same function, and the module's warning is reported once more.
 *
 * Settlement design, step 0 (design-settlement.md §2, the instance-local
 * sink; §6 row (c)), a pin expected green on head: step 4 (the Rsbuild
 * loader on `session.transform`) keeps it green.
 * Source: Astra's review of the settlement design, change 3.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
} from '../../build-harness'
import { workerPluginOf } from './worker-plugin'

const timeout = 120_000

const files = {
  // (a middleware factory whose parameter only server code reads: a
  // compiler warning of the file)
  'src/fns.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'MARK_GREET')
export const requireRole = (role: string) =>
  createMiddleware().server(async ({ next }) => {
    if (role === 'none') {
      throw new Error('no')
    }
    return next()
  })
`,
  'src/worker.ts': `import { greet } from './fns'
self.onmessage = () => {
  self.postMessage(greet.url)
}
`,
  'src/entry.ts': `export { greet, requireRole } from './fns'\n`,
  'src/ssr-entry.ts': callByIdExports,
}

describe('rsbuild build: one file in the client and in a worker', () => {
  test.for(['make', 'done'] as const)(
    'the worker built at %s: a build on the cache is the clean build',
    { timeout },
    async (at) => {
      /** What a build serves: the client's and the worker's call, and the file's warnings. */
      const outcome = async (cached: boolean) => {
        const build = await buildStart({
          bundler: 'rsbuild',
          files,
          entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
          builds: cached ? 2 : 1,
          rsbuildConfig: {
            ...(cached && { performance: { buildCache: true } }),
            environments: {
              client: {
                tools: { rspack: { plugins: [workerPluginOf({ at })] } },
              },
            },
          },
        })
        const url = (await build.client.run(`return entry.greet.url`))
          .result as string
        const { result } = await build.ssr.run(
          `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
        )
        // (a child compilation run once the compiler is done emits nothing)
        const workerFile = path.join(build.client.outDir, 'worker.js')
        return {
          call: result,
          workerCalls: fs.existsSync(workerFile)
            ? fs
                .readFileSync(workerFile, 'utf8')
                .includes(url.split('/').pop()!)
            : null,
          warnings: findDiagnostics(build.diagnostics, {
            severity: 'warning',
            file: 'src/fns.ts',
          }).length,
        }
      }
      const clean = await outcome(false)
      expect(clean).toMatchObject({
        call: 'MARK_GREET',
        workerCalls: at === 'make' ? true : null,
      })
      expect(clean.warnings).toBeGreaterThan(0)
      expect(await outcome(true)).toEqual(clean)
    },
  )
})
