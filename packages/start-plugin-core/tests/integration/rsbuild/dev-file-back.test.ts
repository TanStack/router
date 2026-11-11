/**
 * Rsbuild dev, a file removed and back: the client compiler applies the
 * removal and builds the importer while the file is gone; the SSR
 * compilation of the removal is still running (a slow loader of the app's
 * holds the importer there), so SSR's last finished compilation still lists
 * the file. The file comes back with the same text, and the client
 * compiler reports it as modified (a file another environment's last
 * compilation read). Rspack resolves the importer's missing import again
 * without building the importer: only the compiler's invalidation can have
 * it built against the file.
 */
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

const timeout = 90_000
const compileTimeout = 30_000

const builder = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`

type Held = typeof globalThis & { __tsrTestHold?: Promise<void> }

/** A loader that holds the modules it runs on while `__tsrTestHold` is set. */
const holdingLoader = `module.exports = function (source) {
  const callback = this.async()
  const hold = globalThis.__tsrTestHold
  if (hold) {
    hold.then(() => callback(null, source))
  } else {
    callback(null, source)
  }
}
`

/**
 * The app's plugin: `harness/holding-loader.cjs` runs last on `src/page.ts`
 * in the SSR environment; `clientDone()` resolves at the end of the
 * client's next compilation.
 */
function holdSsr(): RsbuildPlugin & { clientDone: () => Promise<void> } {
  let waiters: Array<() => void> = []
  return {
    name: 'test:hold-ssr',
    clientDone: () => new Promise<void>((resolve) => waiters.push(resolve)),
    setup(api) {
      api.modifyRspackConfig((config, { environment }) => {
        if (environment.name === 'ssr') {
          config.module ??= {}
          config.module.rules ??= []
          config.module.rules.push({
            test: /[\\/]src[\\/]page\.ts$/,
            enforce: 'post',
            use: [
              {
                loader: path.join(
                  api.context.rootPath,
                  'harness/holding-loader.cjs',
                ),
              },
            ],
          })
          return
        }
        config.plugins.push({
          apply(compiler: Rspack.Compiler) {
            compiler.hooks.done.tap('test:hold-ssr', () => {
              const done = waiters
              waiters = []
              for (const resolve of done) {
                resolve()
              }
            })
          },
        })
      })
    },
  }
}

describe('Rsbuild dev: a file removed and back while another environment compiles', () => {
  // Bug: the client compiler's event of the file's return was a change of
  // a path the caches held nothing of (both removals were applied), which
  // the invalidation dropped; the client's importer kept the plan its build
  // made while the file was gone (the import unresolved: the handler stayed
  // in the client), and SSR's own event of the return was a change too.
  // Source: CI failure of property (b), seed 24344 (the probe of its
  // report).
  test(
    "the importer's client output is compiled against the file",
    async () => {
      const plugin = holdSsr()
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        config: { plugins: [plugin] },
        files: {
          'harness/holding-loader.cjs': holdingLoader,
          'src/lib/a.ts': builder,
          'src/page.ts': `import { base } from './lib/a'
export const page = base.handler(async () => 'MARK_PAGE')
`,
          'src/entry.ts': `import { page } from './page'
console.log(page)
`,
        },
      })
      const client = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(server.errors).toEqual([])
      expect(await client()).not.toContain('MARK_PAGE')
      let release!: () => void
      ;(globalThis as Held).__tsrTestHold = new Promise<void>((resolve) => {
        release = resolve
      })
      try {
        const removed = plugin.clientDone()
        await rm(path.join(server.root, 'src/lib/a.ts'))
        await removed
        const back = plugin.clientDone()
        await writeFile(path.join(server.root, 'src/lib/a.ts'), builder)
        await back
      } finally {
        delete (globalThis as Held).__tsrTestHold
        release()
      }
      await server.settle()
      await waitForOutcome({
        applied: async () => !(await client()).includes('MARK_PAGE'),
        timeout: compileTimeout,
        describe: () => 'the client output still holds the handler',
      })
    },
    timeout,
  )
})
