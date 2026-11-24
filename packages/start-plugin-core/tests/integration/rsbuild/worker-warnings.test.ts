/**
 * Start's Rsbuild host, the warnings of modules a child compiler builds (a
 * worker plugin's): a child compilation reports its modules' warnings on
 * behalf of the compilation that owns it, which a worker plugin may hand them
 * to (rule 4 of the Rsbuild host).
 * Source: review-hotspot3-merged-astra.md, finding 2.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { buildStart, callByIdExports } from '../../build-harness'
import type { Rspack } from '@rsbuild/core'

const timeout = 120_000

/** A middleware factory whose parameter only server code reads: a compiler warning. */
const serverParam = `import { createMiddleware } from '@tanstack/react-start'
export const requireRole = (role: string) =>
  createMiddleware().server(async ({ next }) => {
    if (role === 'none') {
      throw new Error('no')
    }
    return next()
  })
`

/** A worker plugin that hands its child compilation's warnings to the client compilation. */
const forwardingWorkerPlugin = {
  apply(compiler: Rspack.Compiler) {
    compiler.hooks.make.tapPromise('app:worker', (compilation) => {
      const child = compilation.createChildCompiler(
        'app-worker',
        { filename: 'worker.js', chunkFilename: 'worker-[name].js' },
        [
          new compiler.rspack.EntryPlugin(compiler.context, './src/worker.ts', {
            name: 'worker',
          }),
          new compiler.rspack.webworker.WebWorkerTemplatePlugin(),
        ],
      )
      return new Promise<void>((resolve, reject) => {
        child.runAsChild((error, _entries, built) => {
          if (error) {
            reject(error)
            return
          }
          compilation.warnings.push(...(built?.warnings ?? []))
          resolve()
        })
      })
    })
  },
}

describe('rsbuild build: a module only a worker imports', () => {
  // Finding 2. The worker is built by a child compiler of the client
  // compilation (Rspack's public plugin API), which hands its warnings to
  // the compilation, as a worker plugin does. The compiler's warning of a
  // module only the worker imports is one of them.
  test(
    "the compiler's warning of the module is reported with the worker's",
    async () => {
      const build = await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/role.ts': serverParam,
          'src/worker.ts': `import { requireRole } from './role'
self.onmessage = () => self.postMessage(String(requireRole))
`,
          'src/entry.ts': `export const none = 1\n`,
          'src/ssr-entry.ts': `export const none = 1\n${callByIdExports}`,
        },
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        rsbuildConfig: {
          environments: {
            client: {
              tools: { rspack: { plugins: [forwardingWorkerPlugin] } },
            },
          },
        },
      })
      // (the worker plugin hands the child's warnings to a compilation that
      // does not hold the module: the report keeps no file of its own, so
      // the row counts the build's warnings; this app has no other)
      expect(
        problems(build.diagnostics).filter((d) => d.severity === 'warning')
          .length,
      ).toBeGreaterThan(0)
    },
    timeout,
  )
})

