/**
 * Start's Rsbuild host, the warnings of modules a child compiler builds (a
 * worker plugin's): a child compilation reports its modules' warnings on
 * behalf of the compilation that owns it, which a worker plugin may hand them
 * to (rule 4 of the Rsbuild host).
 * Source: review-hotspot3-merged-astra.md, finding 2.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  diagnosticsOf,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, callByIdExports } from '../../build-harness'
import { appManifest, installPackage } from '../../package-layouts'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { rsbuildEntries } from '../route-css-cases'
import { workerPlugin } from './worker-plugin'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

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

/** `ui-kit`, a package that uses Start and does not declare it. */
const uiKit = installPackage('npm', {
  name: 'ui-kit',
  files: {
    'a.js': `import { createIsomorphicFn } from '@tanstack/react-start'
export const tag = createIsomorphicFn().client(() => 'client').server(() => 'server')
`,
  },
})

/** A page and a worker that both import `ui-kit`: the client, the server and the worker's child compilation hold it. */
const sharedFiles = {
  ...rsbuildEntries,
  ...uiKit.files,
  'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { tag } from 'ui-kit/a.js'
export const Route = createFileRoute('/')({ component: () => <p>{tag()}</p> })
`,
  'src/worker.ts': `import { tag } from 'ui-kit/a.js'
self.onmessage = () => self.postMessage(tag())
`,
}

const workers = [
  ['a worker plugin that does not hand over its warnings', workerPlugin],
  ['a worker plugin that hands over its warnings', forwardingWorkerPlugin],
] as const

/** The package's warnings in each report Rsbuild prints (`onAfterBuild`, `onDevCompileDone`), of the compilations it prints. */
function printedPackageWarnings() {
  const printed: Array<Array<Diagnostic>> = []
  const record = (stats: Rspack.Stats | Rspack.MultiStats) => {
    const all = 'stats' in stats ? stats.stats : [stats]
    printed.push(
      all.flatMap((one) =>
        diagnosticsOf(
          one.toJson({ all: false, warnings: true }).warnings ?? [],
          'warning',
        ),
      ),
    )
  }
  const plugin: RsbuildPlugin = {
    name: 'test:printed-warnings',
    setup(api) {
      api.onAfterBuild(({ stats }) => stats && record(stats))
      api.onDevCompileDone(({ stats }) => record(stats))
    },
  }
  const counts = (root: string) =>
    printed.map(
      (report) =>
        findDiagnostics(report, {
          severity: 'warning',
          file: `${uiKit.directory}/a.js`,
          root,
        }).length,
    )
  return { plugin, counts }
}

describe('rsbuild: a package a page and a worker share', () => {
  // Astra, round 2 of the merged design: the worker's child compilation
  // holds the package too. Whether or not the worker plugin hands the
  // child's warnings to the client compilation, the package's warning is
  // printed once: a child's report does not take the warning from the
  // compilations Rsbuild prints.
  // Source: review-hotspot3-merged-2-astra.md, required change.
  test.each(workers)(
    'build, %s: the package warning is printed once',
    async (_, worker) => {
      const printed = printedPackageWarnings()
      const build = await buildStart({
        bundler: 'rsbuild',
        packageJson: appManifest([uiKit]),
        files: sharedFiles,
        rsbuildConfig: {
          plugins: [printed.plugin],
          environments: {
            client: { tools: { rspack: { plugins: [worker] } } },
          },
        },
      })
      expect(printed.counts(build.root)).toEqual([1])
    },
    timeout,
  )

  // (Rsbuild prints an environment's last compilation again when another
  // environment compiles after it: once in a report)
  test.each(workers)(
    'dev, %s: the package warning is printed, once in a report',
    async (_, worker) => {
      const printed = printedPackageWarnings()
      const server = await startRsbuildStartDevServer({
        packageJson: appManifest([uiKit]),
        config: {
          plugins: [printed.plugin],
          environments: {
            client: { tools: { rspack: { plugins: [worker] } } },
          },
        },
        files: sharedFiles,
      })
      await server.settle()
      expect(Math.max(0, ...printed.counts(server.root))).toBe(1)
    },
    timeout,
  )
})
