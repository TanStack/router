/**
 * What a dev server reports of a violation, and the fixes its report
 * suggests, applied (R101; the build side: report-fixes.test.ts). Real Vite
 * and Rsbuild dev servers of a Start app, client code in a browser page;
 * diagnostics are checked by severity, file and position only.
 *
 * - with `behavior: 'error'`, the importer's failure names the import's
 *   position, and nothing of Start's own code (an Rsbuild loader's failure
 *   was wrapped as the loader's, with the frames of the plugin's code, at
 *   `file:1:1`);
 * - the negative pattern a pattern import's report suggests leaves the
 *   denied file out: nothing is reported and the page runs without it.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  problemsNaming,
  violationRecorder,
} from '../../importProtection/start-apps'
import {
  runInClient,
  runRsbuildClient,
  runViteClient,
  startBrowserRsbuildDevServer,
  startBrowserRsbuildStartDevServer,
  startBrowserStartDevServer,
} from './client-pages'
import type { RsbuildPlugin } from '@rsbuild/core'

const timeout = 60_000

/**
 * The location of each compilation error and warning, as Rsbuild reads it
 * from its stats to print `File: <moduleName>:<loc>` (`:1:1` without one).
 */
function recordLocations() {
  const seen: Array<{
    severity: string
    moduleName?: string
    loc?: string
    message: string
  }> = []
  const plugin: RsbuildPlugin = {
    name: 'test:diagnostic-locations',
    setup(api) {
      api.onAfterEnvironmentCompile(({ stats }) => {
        const json = stats?.toJson({ all: false, errors: true, warnings: true })
        for (const severity of ['error', 'warning'] as const) {
          for (const entry of json?.[`${severity}s`] ?? []) {
            seen.push({
              severity,
              moduleName: entry.moduleName,
              loc: entry.loc,
              message: entry.message,
            })
          }
        }
      })
    },
  }
  return { plugin, seen }
}
/** The built plugin's code (`packages/start-plugin-core/dist`). */
const pluginDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../dist',
)
const compileTimeout = timeout

const denied = {
  'src/lib/db.server.ts': `export const db = () => 'MARK_DB'\n`,
}

describe('rsbuild dev, behavior error', () => {
  test(
    "the importer's failure names the import's position and none of the plugin's own files",
    async () => {
      const recorder = violationRecorder({ behavior: 'error' })
      const { plugin, seen } = recordLocations()
      const server = await startBrowserRsbuildDevServer({
        compileTimeout,
        importProtection: recorder.importProtection,
        config: { plugins: [plugin] },
        files: {
          ...denied,
          'src/entry.ts': `export const one = 1
import { db } from './lib/db.server'
console.log(db())
`,
        },
      })
      // (the importer fails to build: the page throws the denial)
      await runRsbuildClient(server).catch(() => [])
      const reported = { file: 'src/entry.ts', root: server.root }
      expectDiagnostic(server.diagnostics, {
        ...reported,
        severity: 'error',
        position: { line: 2, column: 20 },
      })
      expect(
        findDiagnostics(server.diagnostics, reported)
          .map(({ text }) => text)
          .filter((text) => text.includes(pluginDist)),
      ).toEqual([])
      // the compilation's location of the failure (Rsbuild's `File:` line)
      expect(
        seen
          .filter(
            (e) =>
              e.moduleName?.replace(/^\.\//, '') === 'src/entry.ts' &&
              e.message.includes('[import-protection]'),
          )
          .map(({ severity, loc }) => ({ severity, loc })),
      ).toContainEqual({ severity: 'error', loc: '2:20' })
    },
    timeout,
  )
})

const globbing = {
  ...denied,
  'src/lib/util.ts': `export const util = () => 'util'\n`,
  'src/entry.ts': `const modules = import.meta.glob(['./lib/*.ts', '!./lib/db.server.ts'], { eager: true })
;(globalThis as any).read = () => Object.keys(modules)
`,
  // (the router entry of a Vite app: it reaches the client's modules)
  'src/router.ts': `import './entry'\nexport const getRouter = () => undefined\n`,
}

describe.each([
  {
    host: 'vite dev',
    run: async () => {
      const recorder = violationRecorder()
      const server = await startBrowserStartDevServer({
        start: { importProtection: recorder.importProtection },
        files: globbing,
      })
      const { result } = await runViteClient(
        server,
        '/src/entry.ts',
        'return globalThis.read()',
      )
      await server.idle()
      return { server, recorder, result }
    },
  },
  {
    host: 'rsbuild dev',
    run: async () => {
      const recorder = violationRecorder()
      const server = await startBrowserRsbuildStartDevServer({
        compileTimeout,
        hmr: false,
        files: globbing,
        start: { importProtection: recorder.importProtection },
      })
      const ran = await runInClient(server, 'return globalThis.read()')
      return {
        server,
        recorder,
        result: 'result' in ran ? ran.result : ran.error,
      }
    },
  },
])('$host', ({ run }) => {
  test(
    'a negative pattern naming the denied file leaves it out: nothing is reported, and the page runs without it',
    async () => {
      const { server, recorder, result } = await run()
      expect(result).toEqual(['./lib/util.ts'])
      expect(recorder.violations).toEqual([])
      expect(problemsNaming(server, ['src/lib/db.server.ts'])).toEqual([])
    },
    timeout,
  )
})
