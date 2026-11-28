/**
 * Start's Rsbuild host, the warnings of modules a child compiler builds (a
 * worker plugin's), in builds: Rsbuild prints no child compilation, so a
 * child's warnings are its owner's (rule 4 of the Rsbuild host). Each is
 * printed once, at its file, whatever the worker plugin does with the
 * child's own warnings, whoever else imports the module, whenever the child
 * runs, and when the persistent cache restored the worker's modules.
 * Sources: review-hotspot3-merged-astra.md finding 2,
 * review-hotspot3-merged-2-astra.md, review-hotspot3-impl-astra.md findings
 * 1 and 4, review-hotspot3-impl-fable.md findings 1 and 3.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { appManifest } from '../../package-layouts'
import { rsbuildRscLinks } from '../../start-plugins'
import { rscAppFiles } from '../rsc-warning-app'
import { printedWarnings } from './printed-warnings'
import { roleFile, uiKit, uiKitFile, workerApp } from './worker-warning-apps'
import { workerPluginOf } from './worker-plugin'
import type { WorkerPluginOptions } from './worker-plugin'
import type { RsbuildConfig } from '@rsbuild/core'

/** What a worker plugin does with its child compilation's warnings. */
const handOvers = [
  ['hands nothing over', false],
  ['hands its warnings over', 'as they are'],
  ['hands its warnings over reworded', 'reworded'],
] as const

/** A build of the worker app with the worker plugin(s) on the client compiler: the counts of each warning per report. */
async function buildWith(
  files: Record<string, string>,
  workers: ReadonlyArray<WorkerPluginOptions>,
  config: RsbuildConfig = {},
) {
  const printed = printedWarnings()
  const build = await buildStart({
    bundler: 'rsbuild',
    packageJson: appManifest([uiKit]),
    files,
    rsbuildConfig: {
      ...config,
      plugins: [printed.plugin],
      environments: {
        client: {
          tools: { rspack: { plugins: workers.map(workerPluginOf) } },
        },
      },
    },
  })
  return {
    build,
    compiler: () => printed.counts(build.root, 'src/role.ts'),
    package: () => printed.counts(build.root, uiKitFile),
  }
}

describe('rsbuild build: the warnings of modules only a worker imports', () => {
  // The child compilation holds the only modules with the warnings. They
  // are printed with the client compilation's, at their files, whether or
  // not the worker plugin hands the child's warnings over.
  test.each(handOvers)(
    'a worker plugin that %s: each warning is printed once, at its file',
    async (_, handOver) => {
      const printed = await buildWith(workerApp(), [{ handOver }])
      expect(printed.compiler()).toEqual([1])
      expect(printed.package()).toEqual([1])
    },
  )

  // Two workers import the same modules; the first plugin keeps its child's
  // warnings, the second hands them over.
  test('two workers, the first keeps its warnings and the second hands them over: each warning is printed once', async () => {
    const files = workerApp()
    const printed = await buildWith(
      { ...files, 'src/second.ts': files['src/worker.ts'] },
      [
        { name: 'worker' },
        { name: 'second', entry: './src/second.ts', handOver: 'as they are' },
      ],
    )
    expect(printed.compiler()).toEqual([1])
    expect(printed.package()).toEqual([1])
  })

  // The persistent cache restores the worker's modules with their records:
  // a build of the unchanged app on the cache prints what the first did.
  test.each(handOvers.slice(0, 2))(
    'a worker plugin that %s, a build of the unchanged app on the persistent cache: the same warnings',
    async (_, handOver) => {
      const cold = await buildWith(workerApp(), [{ handOver }], {
        performance: { buildCache: true },
      })
      expect([cold.compiler(), cold.package()]).toEqual([[1], [1]])
      await cold.build.rebuild({})
      expect([cold.compiler(), cold.package()]).toEqual([
        [1, 1],
        [1, 1],
      ])
    },
  )
})

describe('rsbuild build: a package a worker and other code import', () => {
  // The page imports the package too: the client's, the server's and the
  // child's compilations hold it.
  test.each(handOvers)(
    'the page imports it, a worker plugin that %s: the package warning is printed once',
    async (_, handOver) => {
      const printed = await buildWith(workerApp({ page: true }), [{ handOver }])
      expect(printed.package()).toEqual([1])
    },
  )

  // Server code imports it and the page does not: the client compilation,
  // which owns the worker's, does not hold the package's module.
  test.each(handOvers)(
    'server code imports it and the page does not, a worker plugin that %s: the package warning is printed once',
    async (_, handOver) => {
      const printed = await buildWith(workerApp({ server: true }), [
        { handOver },
      ])
      expect(printed.package()).toEqual([1])
    },
  )

  // The worker plugin runs its child compiler once the client compiler is
  // done, and hands nothing over.
  test('server code imports it, the worker is built once the client compiler is done: the package warning is printed once', async () => {
    const printed = await buildWith(workerApp({ server: true }), [
      { at: 'done' },
    ])
    expect(printed.package()).toEqual([1])
  })
})

describe('rsbuild build with RSC: a module a page and a worker share', () => {
  test.each(handOvers.slice(0, 2))(
    "a worker plugin that %s: the module's compiler warning is printed once",
    async (_, handOver) => {
      const printed = printedWarnings()
      const build = await buildStart({
        bundler: 'rsbuild',
        entry: 'src/entry.ts',
        symlinks: rsbuildRscLinks(),
        start: { rsc: { enabled: true } } as never,
        files: {
          ...rscAppFiles,
          'src/entry.ts': `export {}\n`,
          'tsconfig.json': JSON.stringify({
            compilerOptions: { jsx: 'react-jsx' },
          }),
          'src/role.ts': roleFile,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { requireRole } from '../role'
export const Route = createFileRoute('/')({
  component: () => <main>{String(requireRole).length}</main>,
})
`,
          'src/worker.ts': `import { requireRole } from './role'
self.onmessage = () => self.postMessage(String(requireRole))
`,
        },
        rsbuildConfig: {
          plugins: [printed.plugin],
          environments: {
            client: {
              tools: { rspack: { plugins: [workerPluginOf({ handOver })] } },
            },
          },
        },
      })
      expect(printed.counts(build.root, 'src/role.ts')).toEqual([1])
    },
  )
})
