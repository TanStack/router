/**
 * Start's Rsbuild build, a module an app plugin builds again in place after
 * Start's settlement began (Rspack's `rebuildModule` at `finishMake` stage
 * 50), which gains a server function without changing the module count: the
 * registry is derived again from what the compilation holds (rule 2 of the
 * Rsbuild host: a derivation runs when a loader ran since the last one).
 * Source: review-hotspot3-merged-astra.md, finding 1.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { callByIdExports, callByIdPrelude } from '../../build-harness'
import { buildStart } from '../../build-start'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

describe('rsbuild build: a module an app plugin builds again late', () => {
  // Finding 1. An app loader serves `late.ts` without its server function
  // until the app's own plugin is ready, at `finishMake` stage 50, and
  // builds the module again there (Rspack's public `rebuildModule`). The
  // compilation has as many modules as before; the module's record changed.
  // The client calls the function: the server must provide it.
  test('the client module gains a server function at a late stage: its call answers', async () => {
    const state = globalThis as { __START_TEST_LATE_READY__?: boolean }
    state.__START_TEST_LATE_READY__ = false
    const late: RsbuildPlugin = {
      name: 'test:late-module',
      setup(api) {
        api.modifyRspackConfig((config, { environment }) => {
          if (environment.name !== 'client') {
            return
          }
          config.module.rules ??= []
          config.module.rules.push({
            enforce: 'pre',
            test: /late\.ts$/,
            use: [path.join(api.context.rootPath, 'late-loader.cjs')],
          })
          config.plugins.push({
            apply(compiler: Rspack.Compiler) {
              compiler.hooks.finishMake.tapPromise(
                { name: 'test:late-module', stage: 50 },
                async (compilation) => {
                  const module = [...compilation.modules].find((m) =>
                    (m as { resource?: string }).resource?.endsWith('late.ts'),
                  )
                  state.__START_TEST_LATE_READY__ = true
                  await new Promise<void>((resolve, reject) => {
                    compilation.rebuildModule(module!, (error) =>
                      error ? reject(error) : resolve(),
                    )
                  })
                },
              )
            },
          })
        })
      },
    }
    const { client, ssr } = await buildStart({
      bundler: 'rsbuild',
      files: {
        'late-loader.cjs': `module.exports = function (source) {
  this.cacheable(false)
  return globalThis.__START_TEST_LATE_READY__ ? source : 'export const lateAction = () => 0'
}
`,
        'src/late.ts': `import { createServerFn } from '@tanstack/react-start'
export const lateAction = createServerFn().handler(async () => 'MARK_LATE')
`,
        // (the client already calls a server function: the late one adds
        // no module to its compilation)
        'src/other.ts': `import { createServerFn } from '@tanstack/react-start'
export const otherAction = createServerFn().handler(async () => 'MARK_OTHER')
`,
        'src/entry.ts': `export { lateAction } from './late'\nexport { otherAction } from './other'\n`,
        'src/ssr-entry.ts': callByIdExports,
      },
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      rsbuildConfig: { plugins: [late] },
    })
    const url = (await client.run(`return entry.lateAction.url`)).result
    const { result } = await ssr.run(
      `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
    )
    expect(result).toBe('MARK_LATE')
  })
})
