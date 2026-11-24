/**
 * Start's Rsbuild dev server, the warnings of modules a child compiler
 * builds (a worker plugin's): a child's warnings are its owner's, printed
 * once per dev session (rule 4 of the Rsbuild host), whatever the worker
 * plugin does with the child's own warnings and whoever else imports the
 * module.
 * Sources: review-hotspot3-merged-2-astra.md, review-hotspot3-impl-astra.md
 * finding 4, review-hotspot3-impl-fable.md findings 1 and 2.
 */
import { describe, expect, test } from 'vitest'
import { appManifest } from '../../package-layouts'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { startRsbuildRscApp } from '../rsc-warning-app'
import { printedWarnings } from './printed-warnings'
import { roleFile, uiKit, uiKitFile, workerApp } from './worker-warning-apps'
import { workerPluginOf } from './worker-plugin'
import type { WorkerPluginOptions } from './worker-plugin'

const timeout = 120_000

const handOvers = [
  ['hands nothing over', false],
  ['hands its warnings over', 'as they are'],
] as const

/**
 * A dev server on the worker app, saved once after it settled (a module only
 * the client imports): the counts of each warning in the reports before the
 * save and in those after it.
 */
async function devWith(
  holders: Parameters<typeof workerApp>[0],
  worker: WorkerPluginOptions,
) {
  const printed = printedWarnings()
  const files = workerApp(holders)
  const server = await startRsbuildStartDevServer({
    packageJson: appManifest([uiKit]),
    config: {
      plugins: [printed.plugin],
      environments: {
        client: { tools: { rspack: { plugins: [workerPluginOf(worker)] } } },
      },
    },
    files: {
      ...files,
      'src/other.ts': `export const other = 0\n`,
      'src/client.tsx': `import './other'\n${files['src/client.tsx']}`,
    },
  })
  await server.settle()
  const first = printed.reports.length
  await server.write({ 'src/other.ts': `export const other = 1\n` })
  await server.settle({ accept: () => true })
  const split = (counts: Array<number>) => ({
    // (Rsbuild prints an environment's last compilation again when another
    // one compiles after it: once in a report)
    start: Math.max(0, ...counts.slice(0, first)),
    afterSave: counts.slice(first).reduce((a, b) => a + b, 0),
  })
  return {
    compiler: split(printed.counts(server.root, 'src/role.ts')),
    package: split(printed.counts(server.root, uiKitFile)),
  }
}

const once = { start: 1, afterSave: 0 }

describe('rsbuild dev: the warnings of modules a worker imports', () => {
  test.each(handOvers)(
    'only the worker imports them, a worker plugin that %s: each is printed once, and not again after a save',
    async (_, handOver) => {
      const printed = await devWith({}, { handOver })
      expect(printed).toEqual({ compiler: once, package: once })
    },
    timeout,
  )

  test.each(handOvers)(
    'the page imports the package too, a worker plugin that %s: its warning is printed once',
    async (_, handOver) => {
      const printed = await devWith({ page: true }, { handOver })
      expect(printed.package).toEqual(once)
    },
    timeout,
  )

  test.each(handOvers)(
    'server code imports the package and the page does not, a worker plugin that %s: its warning is printed once',
    async (_, handOver) => {
      const printed = await devWith({ server: true }, { handOver })
      expect(printed.package).toEqual(once)
    },
    timeout,
  )

  test(
    'server code imports the package, the worker is built once the client compiler is done: its warning is printed once',
    async () => {
      const printed = await devWith({ server: true }, { at: 'done' })
      expect(printed.package).toEqual(once)
    },
    timeout,
  )
})

describe('rsbuild dev with RSC: a module a page and a worker share', () => {
  test.each(handOvers)(
    "a worker plugin that %s: the module's compiler warning is printed, once in a report",
    async (_, handOver) => {
      const printed = printedWarnings()
      const server = await startRsbuildRscApp(
        {
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
        {
          plugins: [printed.plugin],
          environments: {
            client: {
              tools: { rspack: { plugins: [workerPluginOf({ handOver })] } },
            },
          },
        },
      )
      await server.settle()
      expect(Math.max(0, ...printed.counts(server.root, 'src/role.ts'))).toBe(1)
    },
    timeout,
  )
})
