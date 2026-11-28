/**
 * Start's Rsbuild host, a worker (a child compiler of the client) first
 * requested in a `build --watch` rebuild on a primed persistent cache: the
 * child restores its modules without compiling them, and their records give
 * the warnings (rule 4 of the Rsbuild host: a child's restored modules are
 * indexed as the compiler's own, in every compilation).
 * Source: review-hotspot3-impl-2-astra.md, finding 1 (delayed-worker-cache).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  diagnosticsOf,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart } from '../../build-start'
import { appManifest } from '../../package-layouts'
import { uiKit, uiKitFile, workerApp } from './worker-warning-apps'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

const timeout = 120_000

describe('rsbuild build --watch on the persistent cache: a worker first requested in a rebuild', () => {
  // Two watch sessions on one persistent cache (a new Rsbuild instance
  // each). Each starts without the worker and an edit of the client's flag
  // module requests it. In the second session the child compilation
  // restores the worker's modules from the cache and compiles none of them:
  // their records still give the warnings.
  // Source: review-hotspot3-impl-2-astra.md, finding 1 (delayed-worker-cache).
  test(
    'every report with the worker has each warning once, in both sessions',
    async () => {
      const reports: Array<{ worker: boolean; role: number; uiKit: number }> =
        []
      const flagged = {
        apply(compiler: Rspack.Compiler) {
          const requested = () =>
            fs
              .readFileSync(path.join(compiler.context, 'src/flag.ts'), 'utf8')
              .includes('ON')
          compiler.hooks.make.tapPromise('app:flagged-worker', (compilation) =>
            requested()
              ? new Promise<void>((resolve, reject) => {
                  const child = compilation.createChildCompiler(
                    'app-worker',
                    {
                      filename: 'worker.js',
                      chunkFilename: 'worker-[name].js',
                    },
                    [
                      new compiler.rspack.EntryPlugin(
                        compiler.context,
                        './src/worker.ts',
                        { name: 'worker' },
                      ),
                      new compiler.rspack.webworker.WebWorkerTemplatePlugin(),
                    ],
                  )
                  child.runAsChild((error) =>
                    error ? reject(error) : resolve(),
                  )
                })
              : Promise.resolve(),
          )
        },
      }
      let root = ''
      const record: RsbuildPlugin = {
        name: 'test:flagged-reports',
        setup(api) {
          root = api.context.rootPath
          api.onAfterBuild(({ stats }) => {
            if (!stats) {
              return
            }
            const all = 'stats' in stats ? stats.stats : [stats]
            const printed = all.flatMap((one) =>
              diagnosticsOf(
                one.toJson({ all: false, warnings: true }).warnings ?? [],
                'warning',
              ),
            )
            const count = (file: string) =>
              findDiagnostics(printed, { severity: 'warning', file, root })
                .length
            reports.push({
              worker: all.some(
                (one) => !!one.compilation.getAsset('worker.js'),
              ),
              role: count('src/role.ts'),
              uiKit: count(uiKitFile),
            })
          })
        },
      }
      const files = workerApp()
      await buildStart({
        bundler: 'rsbuild',
        builds: 2,
        packageJson: appManifest([uiKit]),
        files: {
          ...files,
          'src/flag.ts': `export const flag = 'OFF'\n`,
          'src/client.tsx': `import './flag'\n${files['src/client.tsx']}`,
        },
        rsbuildConfig: {
          plugins: [record],
          performance: { buildCache: true },
          environments: {
            client: { tools: { rspack: { plugins: [flagged] } } },
          },
        },
        watchEdits: [
          { edits: { 'src/flag.ts': `export const flag = 'ON'\n` } },
          { edits: { 'src/flag.ts': `export const flag = 'OFF'\n` } },
        ],
      })
      const withWorker = reports.filter((one) => one.worker)
      expect(withWorker.length).toBeGreaterThanOrEqual(2)
      expect(
        withWorker.filter((one) => one.role !== 1 || one.uiKit !== 1),
      ).toEqual([])
    },
    timeout,
  )
})
